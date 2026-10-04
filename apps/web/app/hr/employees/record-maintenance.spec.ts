import assert from "node:assert/strict";
import test from "node:test";
import { admitRecordVersion,buildRecordPatch,createRecordDraft } from "./record-maintenance";
import type { HrCredentialRecord,HrSkillRecord } from "../../../lib/hr-api";
test("masked credential drafts preserve omitted number and submit only deliberate changes",()=>{
 const row:HrCredentialRecord={id:"synthetic",version:1,credentialType:"资格",credentialName:"合成证照",numberMasked:"SYN***",issuingAuthority:null,acquiredDate:"2020-01-01",validTo:null,note:"原备注"};
 const initial=createRecordDraft("credential",row);assert.equal(initial.credentialNumber,"");
 assert.deepEqual(buildRecordPatch("credential",initial,initial,false),{});
 assert.deepEqual(buildRecordPatch("credential",{...initial,note:"新备注"},initial,false),{note:"新备注"});
 assert.deepEqual(buildRecordPatch("credential",initial,initial,false,true),{credentialNumber:null});
 assert.deepEqual(buildRecordPatch("credential",{...initial,credentialNumber:"SYN-NEW"},initial,false),{credentialNumber:"SYN-NEW"});
});
test("domain drafts allow nullable clear, preserve unprojected grade and guard rollout versions",()=>{
 const row:HrSkillRecord={id:"synthetic",version:2,skillName:"合成技能",proficiency:null,acquiredDate:null,note:"原备注"};
 const initial=createRecordDraft("skill",row);assert.deepEqual(buildRecordPatch("skill",initial,initial,false),{});
 assert.deepEqual(buildRecordPatch("skill",{...initial,note:""},initial,false),{note:null});
 for(const version of [undefined,0,-1,1.5,2147483647])assert.equal(admitRecordVersion({...row,version}),false);
 assert.equal(admitRecordVersion(row),true);assert.equal(admitRecordVersion(null),true);
 const draft=createRecordDraft("experience",null);assert.equal(draft.type,"work");
 assert.deepEqual(buildRecordPatch("skill",{...initial,skillName:" 改名 ",note:"",credentialNumber:"unrelated"},initial,false),{skillName:"改名",note:null});
});
