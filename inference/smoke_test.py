import json
import time
from datetime import datetime, timezone
from pathlib import Path

import modal

app = modal.App("fincite-inference-smoke")

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "torch==2.7.1",
    "transformers==4.51.3",
)

@app.function(
    image=image,
    gpu="T4",
    max_containers=1,
    min_containers=0,
    scaledown_window=2,
    timeout=300,
    retries=0,
)
def generate(config, messages):
    import torch
    import transformers
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        GenerationConfig,
    )

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable.")

    started = time.perf_counter()

    tokenizer = AutoTokenizer.from_pretrained(
        config["model_id"],
        revision=config["model_revision"],
        trust_remote_code=False,
    )

    model = AutoModelForCausalLM.from_pretrained(
        config["model_id"],
        revision=config["model_revision"],
        torch_dtype=torch.float16,
        trust_remote_code=False,
    ).to("cuda").eval()

    torch.cuda.synchronize()
    load_seconds = time.perf_counter() - started

    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=config["enable_thinking"],
    )

    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    input_tokens = inputs["input_ids"].shape[1]

    if input_tokens > config["max_input_tokens"]:
        raise RuntimeError("Input exceeds the configured token limit.")

    generation_config = GenerationConfig.from_model_config(model.config)
    generation_config.do_sample = config["do_sample"]
    generation_config.max_new_tokens = config["max_new_tokens"]
    generation_config.pad_token_id = tokenizer.eos_token_id
    generation_config.eos_token_id = tokenizer.eos_token_id

    started = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            generation_config=generation_config,
        )

    torch.cuda.synchronize()
    generation_seconds = time.perf_counter() - started
    generated = output[0, input_tokens:]
    answer = tokenizer.decode(generated, skip_special_tokens=True).strip()

    if not answer:
        raise RuntimeError("The model returned an empty answer.")

    return {
        "answer": answer,
        "input_tokens": input_tokens,
        "generated_tokens": generated.numel(),
        "reached_token_limit": (
            generated.numel() >= config["max_new_tokens"]
        ),
        "model_load_seconds": round(load_seconds, 3),
        "generation_seconds": round(generation_seconds, 3),
        "gpu": torch.cuda.get_device_name(0),
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
    }


@app.local_entrypoint()
def main():
    root = Path(__file__).resolve().parent.parent
    config = json.loads(
        (root / "inference/model-config.json").read_text(encoding="utf-8-sig")
    )

    messages = [
        {
            "role": "system",
            "content": "Explain concepts in simple English. Keep answers brief.",
        },
        {
            "role": "user",
            "content": (
                "What is retrieval-augmented generation? "
                "Explain it in two short sentences."
            ),
        },
    ]

    started = time.perf_counter()
    result = generate.remote(config, messages)
    result["remote_call_seconds"] = round(time.perf_counter() - started, 3)

    record = {
        "status": "smoke_test_only",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "config": config,
        "messages": messages,
        "result": result,
    }

    folder = root / "evaluation/results"
    folder.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = folder / f"inference-smoke-{timestamp}.json"
    destination.write_text(
        json.dumps(record, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(result, indent=2))
    print(f"Saved: {destination.relative_to(root)}")
    print("Smoke test only. No RAG or answer-quality benchmark yet.")
