"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isChatAnswer, type ChatAnswer } from "@/lib/chat-types";
import { previewExamples, type PreviewExample } from "@/lib/preview-examples";
import styles from "./fincite-workspace.module.css";

type IconName = "card" | "percent" | "shield" | "spark" | "arrow" | "plus" | "chat" | "book" | "external" | "copy" | "check" | "close";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
    percent: <><path d="m6 18 12-12" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></>,
    shield: <><path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />, plus: <path d="M12 5v14M5 12h14" />,
    chat: <path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z" />,
    book: <><path d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /></>,
    external: <><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />, close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
type Turn = { question: string; result: ChatAnswer; isPreview: boolean };

export default function FinCiteWorkspace() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const about = useRef<HTMLDialogElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { controller.current?.abort(); if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => { if (turns.length || pending || error) end.current?.scrollIntoView({ behavior: "auto", block: "nearest" }); }, [turns.length, pending, error]);

  function reset() {
    requestId.current += 1; controller.current?.abort();
    setTurns([]); setQuestion(""); setError(""); setPending(false); setSubmittedQuestion("");
    setCopied(null); setCopyNotice(""); input.current?.focus();
  }
  function showExample(example: PreviewExample) {
    requestId.current += 1; controller.current?.abort();
    setPending(false); setError(""); setSubmittedQuestion(""); setCopyNotice(""); setCopied(null);
    setTurns((items) => [...items, { question: example.question, result: example, isPreview: true }]); setQuestion("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = question.trim(); if (!text || pending) return;
    const id = ++requestId.current; const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30000);
    setPending(true); setError(""); setSubmittedQuestion(text);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }), signal: abort.signal });
      const body: unknown = await response.json();
      if (!response.ok) {
        let message = "FinCite could not answer right now. Please try again.";
        if (body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "message" in body.error && typeof body.error.message === "string") message = body.error.message;
        throw new Error(message);
      }
      if (!isChatAnswer(body)) throw new Error("The answer format could not be verified. Please try again.");
      if (requestId.current !== id) return;
      setTurns((items) => [...items, { question: text, result: body, isPreview: false }]); setQuestion(""); setSubmittedQuestion("");
    } catch (cause) {
      if (requestId.current !== id) return;
      setError(abort.signal.aborted ? "The request timed out. Please try again." : cause instanceof Error ? cause.message : "Connection failed. Please try again.");
    } finally { clearTimeout(timer); if (requestId.current === id) { setPending(false); controller.current = null; } }
  }
  async function copyAnswer(index: number, turn: Turn) {
    try {
      await navigator.clipboard.writeText(`${turn.isPreview ? "FinCite curated preview example\n\n" : ""}${turn.result.answer}\n\n${turn.result.sources.map((source) => source.url).join("\n")}`);
      setCopied(index); setCopyNotice("Answer copied."); if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { setCopied(null); setCopyNotice(""); }, 2500);
    } catch { setCopyNotice("Copy unavailable. You can select and copy the answer text."); }
  }
  return <div className={styles.shell}>
    <a className={styles.skipLink} href="#question">Skip to question</a>
    <aside className={styles.sidebar} aria-label="FinCite navigation">
      <Link className={styles.brand} href="/" aria-label="FinCite home"><span className={styles.brandMark}><Icon name="book" size={23} /></span>FinCite<span className={styles.brandDot}>.</span></Link>
      <p className={styles.brandCaption}>Clarity you can trace.</p>
      <button className={styles.newChat} onClick={reset}><Icon name="plus" size={18} />New conversation</button>
      <div className={styles.navItem}><Icon name="chat" size={18} /><span>Ask FinCite</span><span className={styles.activeDot} /></div>
      <button className={styles.aboutButton} onClick={() => about.current?.showModal()}><Icon name="book" size={18} />How it works</button>
      <div className={styles.sidebarExamples}><p className={styles.eyebrow}>EXPLORE EXAMPLES</p>{previewExamples.map((example) => <button key={example.id} onClick={() => showExample(example)}><Icon name={example.icon} size={16} /><span>{example.title}</span></button>)}</div>
      <div className={styles.sidebarNote}><span className={styles.noteIcon}><Icon name="shield" size={19} /></span><p>A useful answer starts<br />with reliable evidence.</p><small>Know the source.<br />Know the limits.</small></div>
      <a className={styles.repoLink} href="https://github.com/Dhananjay2799/fincite" target="_blank" rel="noopener noreferrer">View the project<Icon name="external" size={14} /></a>
    </aside>
    <div className={styles.mainColumn}>
      <header className={styles.header}><div><span className={styles.headerTitle}>Your financial questions, explained</span><span className={styles.headerSubtitle}>Consumer finance · CFPB sources</span></div><span className={styles.previewBadge}><span />Interface preview</span></header>
      <main className={styles.workspace}>
        <section className={styles.conversation} aria-label="Conversation">
          {turns.length === 0 ? <div className={styles.welcome}>
            <div className={styles.heroEmblem}><Icon name="spark" size={29} /></div>
            <p className={styles.heroKicker}>A LITTLE LESS CONFUSION. A LITTLE MORE CLARITY.</p>
            <h1>Money questions.<br /><em>Clearer answers.</em></h1>
            <p className={styles.heroDescription}>Understand credit cards, credit reports, and consumer rights—with sources you can open and evidence limits you can see.</p>
            <div className={styles.heroTags}><span><Icon name="book" size={14} />Source-linked</span><span><Icon name="chat" size={14} />Plain English</span><span><Icon name="shield" size={14} />Clear limits</span></div>
            <div className={styles.exampleHeading}><span>Start with an example</span><small>Curated previews · not live AI answers</small></div>
            <div className={styles.exampleGrid}>{previewExamples.map((example) => <button key={example.id} className={styles.exampleCard} onClick={() => showExample(example)}><span className={styles.exampleIcon}><Icon name={example.icon} /></span><span className={styles.eyebrow}>{example.topic}</span><strong>{example.title}</strong><span className={styles.cardArrow} aria-hidden="true">↗</span></button>)}</div>
          </div> : <div className={styles.turns}>{turns.map((turn, index) => <article key={index} className={styles.turn}>
            <div className={styles.questionBubble}><span className={styles.eyebrow}>YOUR QUESTION</span><h2>{turn.question}</h2></div>
            <div className={styles.answerHeader}><span className={styles.answerMark}><Icon name="book" size={17} /></span><strong>FinCite</strong><span className={styles.answerBadge}>{turn.isPreview ? "Curated example" : "Model response"}</span></div>
            {turn.result.disposition === "evidence_limited" ? <p className={styles.limitBadge}><Icon name="shield" size={16} />The evidence has a limit here</p> : null}
            <div className={styles.answerBody}>{turn.result.answer.split("\n\n").map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>
            {turn.result.sources.length ? <div className={styles.sources}><p className={styles.sourceHeading}><Icon name="book" size={15} />{turn.isPreview ? "Sources for this example" : "Provided sources"}</p>{turn.result.sources.map((source, sourceIndex) => <details className={styles.sourceCard} key={source.id}><summary><span className={styles.sourceNumber}>{sourceIndex + 1}</span><span><small>CONSUMER FINANCIAL PROTECTION BUREAU</small><strong>{source.title}</strong></span><span className={styles.expandLabel}>Passage <span aria-hidden="true">⌄</span></span></summary><div className={styles.sourceContent}><blockquote>{source.quote}</blockquote><a href={source.url} target="_blank" rel="noopener noreferrer">Read the full CFPB article<Icon name="external" size={14} /></a></div></details>)}</div> : <p className={styles.noSources}>No supporting source cited.</p>}
            <div className={styles.answerFooter}><button onClick={() => copyAnswer(index, turn)}><Icon name={copied === index ? "check" : "copy"} size={15} />{copied === index ? "Copied" : "Copy answer"}</button>{turn.isPreview ? <small>Written to illustrate the interface. Not generated live.</small> : null}</div>
          </article>)}</div>}
          {pending ? <div className={styles.requestStatus} role="status"><span className={styles.spinner} />Connecting to FinCite…</div> : null}
          {error ? <div className={styles.error} role="alert"><strong>Live answer unavailable</strong><p>{error}</p><small>Question: {submittedQuestion}</small></div> : null}
          <div ref={end} />
        </section>
        <aside className={styles.evidencePanel} aria-label="About FinCite evidence">
          <div className={styles.evidenceArt} aria-hidden="true"><div className={styles.artRing} /><div className={styles.artPaper}><span /><span /><span /><span /></div><span className={styles.artShield}><Icon name="shield" size={26} /></span><span className={styles.artStar}>✦</span></div>
          <p className={styles.eyebrow}>THE FINCITE APPROACH</p><h2>A source behind<br />the explanation.</h2><p className={styles.panelDescription}>Financial guidance is easier to understand when you can see where it comes from.</p>
          <ol className={styles.steps}><li><span>01</span><div><strong>Find relevant guidance</strong><p>Search official CFPB articles.</p></div></li><li><span>02</span><div><strong>Explain it simply</strong><p>Turn evidence into a clear answer.</p></div></li><li><span>03</span><div><strong>Make limits visible</strong><p>Say when the evidence falls short.</p></div></li></ol>
          <div className={styles.corpusNote}><Icon name="book" size={18} /><div><strong>Project corpus</strong><p>8 CFPB articles · 17 passages</p><small>Current development snapshot</small></div></div>
          <div className={styles.connectionNote}><span className={styles.connectionDot} /><div><strong>Live inference not connected</strong><p>Explore the curated examples while the chat endpoint is being integrated.</p></div></div>
        </aside>
      </main>
      <footer className={styles.composerArea}>
        <form className={styles.composer} onSubmit={submit} aria-label="Ask a finance question"><label htmlFor="question" className={styles.srOnly}>Your finance question</label><textarea ref={input} id="question" rows={2} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about credit cards, reports, or your consumer rights…" aria-describedby="composer-note" disabled={pending} /><div className={styles.composerBottom}><span><Icon name="shield" size={13} />Leave out account numbers and personal details</span><button type="submit" disabled={!question.trim() || pending} aria-label="Send question"><Icon name="arrow" size={20} /></button></div></form>
        <p id="composer-note" className={styles.composerNote}>Preview: custom questions are not answered yet. Examples are curated. General information, not personal financial advice.</p>
        <span role="status" className={styles.srOnly}>{copyNotice}</span>
      </footer>
    </div>
    <dialog ref={about} className={styles.dialog}><div className={styles.dialogHeader}><span className={styles.eyebrow}>ABOUT THE PROJECT</span><button onClick={() => about.current?.close()} aria-label="Close project information" autoFocus><Icon name="close" /></button></div><h2>Clarity, with evidence.</h2><p>FinCite explores how retrieval-augmented generation (RAG) and LoRA fine-tuning can improve consumer finance answers.</p><p>The project has source ingestion, hybrid retrieval, reranking, and a fine-tuning experiment. Evaluation is still in development; final accuracy and hallucination-reduction claims have not been established.</p><p>This screen is a frontend preview. Example answers are curated, and the live model endpoint is not connected. FinCite does not access bank accounts or freeze credit reports.</p><a href="https://github.com/Dhananjay2799/fincite" target="_blank" rel="noopener noreferrer">Explore code and development results <Icon name="external" size={15} /></a></dialog>
  </div>;
}
