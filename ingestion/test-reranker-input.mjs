import test from "node:test";
import assert from "node:assert/strict";
import { excerptRankingText } from "./reranker-input.mjs";
import { requestsPersonalDecisionGuarantee, assessExcerptFocus } from "./excerpt-focus.mjs";
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

test("a personal approval guarantee is outside the general-guidance scope",()=>{
 for(const q of ["Will disputing this error guarantee my mortgage application is approved?",
  "Can you promise my bank will waive this fee?"])
  assert.equal(requestsPersonalDecisionGuarantee(q),true);
 for(const q of ["My loan application was denied. What will the notice tell me?",
  "Can a creditor discriminate because I receive public assistance income?",
  "Can a fixed APR change?"])
  assert.equal(requestsPersonalDecisionGuarantee(q),false);
 const result=assessExcerptFocus("Will disputing this error guarantee my mortgage application is approved?",
  {source_id:"cfpb-1253",text:"It is illegal for a creditor to discriminate in any credit transaction, including mortgages, against any applicant."},vocabulary);
 assert.equal(result.accepted,false);
 assert.equal(result.personal_decision_guarantee,true);
});
