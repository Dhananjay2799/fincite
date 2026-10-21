"""Replay frozen development evidence through clean base and restored LoRA.

No training, database, paid inference or human-quality labels. Imports of the
large inference packages are lazy so data/provenance checks can be tested alone.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "Qwen/Qwen3-1.7B"
REVISION = "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e"
EXPECTED_ADAPTER = "1b68b5f1c76ad912eb958d6b365a8277db568738ebd3d3e1ee53a79b304b4b5e"
RANKED = "evaluation/results/ranked-generation-development-2026-10-21T15-06-22-871Z.json"
SOURCE = "evaluation/results/local-development-2026-10-21T02-22-24-402Z.json"
RANKINGS = "evaluation/results/evidence-reranker-development-v03.json"
PROMPTS = "evaluation/adapter-comparison-prompts.json"


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def cases_from_records(generated, original, rankings):
    assert generated["status"] == "development_generation_complete_ungraded"
    assert rankings["status"] == "offline_development_ranking_complete_ungraded"
    sources = {r["question_id"]: r for r in original["results"]}
    ranked = {r["question_id"]: r for r in rankings["results"]}
    ids = [r["question_id"] for r in generated["results"]]
    assert len(ids) == len(set(ids)) == len(sources) == len(ranked)
    cases = []
    for record in generated["results"]:
        qid = record["question_id"]
        assert record["question"] == sources[qid]["question"] == ranked[qid]["question"]
        assert not record.get("request_error")
        # Keep the frozen generation evidence for the ten generated records.
        # The other three previously used an external relevance gate. Supply
        # their top retrieved units instead: the MODEL must handle insufficiency.
        units = record["packed_units"] if record["generation_performed"] else ranked[qid]["ranked_units"][:3]
        assert units, "Do not make refusal tests trivial by silently dropping evidence."
        for unit in units:
            candidates = [s for s in sources[qid]["api_response"]["sources"] if s["id"] == unit["source_id"]]
            assert len(candidates) == 1
            quote = candidates[0]["quote"]
            start, end = unit["start_char"], unit["end_char"]
            assert isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(quote)
            assert quote[start:end] == unit["text"], "Changed evidence span."
        cases.append({"question_id": qid, "question": record["question"], "evidence": units,
                      "evidence_origin": "saved_packed_units" if record["generation_performed"] else "top_three_saved_ranked_units_no_gate"})
    return cases


def messages_for(case, system):
    return [{"role": "system", "content": system}, {"role": "user", "content":
        "Question: " + case["question"] + "\n\nSupplied passages:\n" +
        "\n\n".join("[" + u["source_id"] + "]\n" + u["text"] for u in case["evidence"])}]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--threads", type=int, default=6)
    args = parser.parse_args()
    assert 1 <= args.threads <= 16
    adapter = args.adapter_dir.resolve()
    assert digest(adapter / "adapter_model.safetensors") == EXPECTED_ADAPTER, "Unexpected adapter weights."
    adapter_config = read_json(adapter / "adapter_config.json")
    assert adapter_config["base_model_name_or_path"] == MODEL_ID
    assert adapter_config["revision"] == REVISION
    cases = cases_from_records(read_json(ROOT / RANKED), read_json(ROOT / SOURCE), read_json(ROOT / RANKINGS))
    prompts = read_json(ROOT / PROMPTS)
    print(f"PASS: selected adapter and {len(cases)} frozen development inputs verified.", flush=True)

    import torch
    import transformers
    import peft
    from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig
    from peft import PeftModel, get_peft_model_state_dict
    from safetensors.torch import load_file
    assert transformers.__version__ == "4.51.3" and peft.__version__ == "0.15.2"
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    torch.manual_seed(42)
    dtype = torch.bfloat16
    device = "cpu"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or ROOT / f"evaluation/results/adapter-prompt-development-{stamp}.json"
    paths = [RANKED, SOURCE, RANKINGS, PROMPTS, "evaluation/compare-adapter.py"]
    inputs = {p: digest(ROOT / p) for p in paths}
    report = {"status": "in_progress", "created_at": datetime.now(timezone.utc).isoformat(),
              "purpose": "controlled_development_comparison_not_heldout", "model_id": MODEL_ID,
              "model_revision": REVISION, "adapter_sha256": EXPECTED_ADAPTER,
              "adapter_config_sha256": digest(adapter / "adapter_config.json"), "input_sha256": inputs,
              "runtime": {"torch": torch.__version__, "transformers": transformers.__version__,
                          "peft": peft.__version__, "python": platform.python_version(),
                          "device": device, "precision": str(dtype), "attention": "sdpa", "threads": args.threads},
              "generation": {"do_sample": False, "num_beams": 1, "max_new_tokens": 256,
                             "enable_thinking": False, "max_input_tokens": 6144, "seed": 42,
                             "use_model_defaults": False},
              "cases": cases, "prompts": prompts, "results": [], "quality_scores": None,
              "limitations": ["Previously inspected development questions; no held-out claim.",
                              "CPU BF16 non-quantized run, not the deployed Q4_K_M runtime or prior Colab FP16 run.",
                              "Three earlier relevance-gated questions now receive saved evidence without a gate.",
                              "Citation presence, exact text and task completion do not establish correctness.",
                              "No training, Gemini call or production configuration change."]}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)

    def save():
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf8")
        temporary.replace(output)

    started = time.perf_counter()
    print("Loading pinned base model on CPU...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, revision=REVISION, trust_remote_code=False,
        torch_dtype=dtype, low_cpu_mem_usage=True, attn_implementation="sdpa").to(device).eval()
    report["model_load_seconds"] = time.perf_counter() - started
    generation = GenerationConfig(do_sample=False, num_beams=1, max_new_tokens=256,
        pad_token_id=tokenizer.eos_token_id, eos_token_id=tokenizer.eos_token_id,
        bos_token_id=tokenizer.bos_token_id)
    effective, _ = model._prepare_generation_config(generation, use_model_defaults=False)
    assert effective.do_sample is False and effective.num_beams == 1 and effective.max_new_tokens == 256
    report["effective_generation_config"] = effective.to_dict()
    print("PASS: model defaults cannot override greedy generation settings.", flush=True)
    try:
        for model_name in ["base", "adapter"]:
            if model_name == "base":
                assert not hasattr(model, "peft_config"), "Base control already has an adapter."
            else:
                model = PeftModel.from_pretrained(model, str(adapter), is_trainable=False).eval()
                saved = load_file(str(adapter / "adapter_model.safetensors"), device="cpu")
                loaded = get_peft_model_state_dict(model)
                assert saved.keys() == loaded.keys(), "Adapter parameter names differ."
                assert all(torch.equal(tensor, loaded[key].cpu().to(tensor.dtype)) for key, tensor in saved.items()), "Loaded adapter differs."
                assert all(torch.isfinite(t).all() for t in saved.values())
                report["adapter_loaded_weights_verified"] = True
                del saved, loaded
                print("PASS: attached adapter parameters match the archive exactly.", flush=True)
            for prompt_name, system in prompts.items():
                for case in cases:
                    record = {"question_id": case["question_id"], "model": model_name, "prompt_version": prompt_name}
                    messages = messages_for(case, system)
                    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
                    batch = tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
                    tokens = batch["input_ids"].shape[1]
                    assert tokens <= 6144, "Whole evidence exceeds input budget; refusing to truncate."
                    before = time.perf_counter()
                    with torch.inference_mode():
                        generated = model.generate(**batch, generation_config=generation,
                            use_model_defaults=False, do_sample=False, num_beams=1, max_new_tokens=256)
                    tail = generated[0, tokens:]
                    answer = tokenizer.decode(tail, skip_special_tokens=True).strip()
                    record.update({"messages": messages, "answer": answer, "input_tokens": tokens,
                                   "generated_tokens": tail.numel(), "generation_seconds": time.perf_counter() - before,
                                   "finish_reason": "stop" if tail.numel() and tail[-1].item() == tokenizer.eos_token_id else "length"})
                    assert math.isfinite(record["generation_seconds"])
                    report["results"].append(record)
                    save()
                    print(f"{len(report['results'])}/{len(cases)*len(prompts)*2}: {model_name} / {prompt_name} / {case['question_id']}: {record['generated_tokens']} tokens, {record['generation_seconds']:.1f}s", flush=True)
        for path, expected in inputs.items():
            assert digest(ROOT / path) == expected, "Input or code changed during comparison."
        report["status"] = "development_comparison_complete_ungraded"
    finally:
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        save()
        print(f"Saved: {output}", flush=True)


if __name__ == "__main__":
    main()
