import test from "node:test";
import assert from "node:assert/strict";
import { excerptRankingText } from "./reranker-input.mjs";
import { assessExcerptFocus } from "./excerpt-focus.mjs";
import vocabulary from "./excerpt-vocabulary.json" with {type:"json"};
test("publisher context informs ranking without changing quoted text",()=>{
 const unit={source_id:"cfpb-313",url:"https://www.consumerfinance.gov/ask-cfpb/example/",text:"If you have a complaint, tell us about your issue."};
 assert.equal(excerptRankingText(unit),"Consumer Financial Protection Bureau (CFPB) source excerpt:\n"+unit.text);
 assert.equal(unit.text,"If you have a complaint, tell us about your issue.");
 for(const change of [{url:"https://www.consumerfinance.gov.evil.example/"},{url:"http://www.consumerfinance.gov/"},{source_id:"other"}])
  assert.throws(()=>excerptRankingText({...unit,...change}));
});
test("verified publisher supplements a first-person excerpt but cannot supply every body anchor",()=>{
 const question="What does the CFPB do after I submit a complaint?";
 assert.equal(assessExcerptFocus(question,{source_id:"cfpb-313",text:"If you have a complaint, tell us about your issue—we’ll forward your issue to the company."},vocabulary).accepted,true);
 assert.equal(assessExcerptFocus(question,{source_id:"cfpb-313",text:"The annual rate may change."},vocabulary).accepted,false);
 assert.equal(assessExcerptFocus(question,{source_id:"unknown",text:"If you have a complaint, tell us about your issue."},vocabulary).accepted,false);
});
