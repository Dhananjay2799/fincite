# FinCite

An evidence-backed consumer-finance assistant built to measure
how RAG and QLoRA fine-tuning affect answer quality,
unsupported claims, and refusal behavior.

## Planned stack

- Next.js, TypeScript, and Node.js on Vercel
- Neon PostgreSQL with pgvector and full-text search
- Modal for Python/PyTorch training and model inference
- Hugging Face for model adapters and datasets

## Current progress

- Next.js starter runs locally
- Two CFPB source snapshots downloaded and hashed
- Article text extracted with source provenance
- Three development questions prepared; human review pending
- Evaluation rubric and integrity validator implemented
- No model evaluation results yet

## Local setup

Requires Node.js and npm.

Install app dependencies:
    cd apps/web
    npm ci

Start the app:
    npm run dev

Install ingestion dependencies from the repository root:
    cd ingestion
    npm ci

## Data validation

From the repository root:
    node evaluation/validate.mjs

The validator requires the local source snapshots and extracted
documents. These are currently excluded from Git.
Snapshot restoration will be added before publishing results.

## Evaluation principles

- Keep training, development, and final test data separate
- Compare generation models using identical retrieved evidence
- Measure unsupported claims alongside answer coverage
- Measure correct refusals and false refusals
- Preserve raw responses, settings, and model versions
- Check automated judges against human review
- Report regressions and limitations honestly
