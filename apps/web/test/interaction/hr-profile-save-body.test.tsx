import { expect,it } from "vitest";
import { buildProfileSaveBody } from "../../app/hr/employees/components/HrFixedProfileFields";

it("approval patch omits absent controls rather than clearing unrelated stored fields",()=>{
 const form=new FormData();form.set("nativePlace","Updated locality");
 expect(JSON.parse(JSON.stringify(buildProfileSaveBody(form,7,"patch")))).toEqual({expectedVersion:7,nativePlace:"Updated locality"});
});

it("approval patch sends explicit clears for present empty controls and retains numeric inputs",()=>{
 const form=new FormData();for(const key of ["dateOfBirth","heightCm","idType","address","personalEmail","idNumber"])form.set(key,"");form.set("weightKg","70.25");
 expect(JSON.parse(JSON.stringify(buildProfileSaveBody(form,7,"patch")))).toEqual({expectedVersion:7,idType:null,idNumber:"",dateOfBirth:null,heightCm:null,weightKg:70.25,personalEmail:null,address:null});
});

it("ordinary complete replacement keeps its existing blank-value transport",()=>{
 const form=new FormData();form.set("dateOfBirth","");form.set("heightCm","");form.set("nativePlace","Original");
 expect(JSON.parse(JSON.stringify(buildProfileSaveBody(form,7)))).toEqual({expectedVersion:7,idNumber:"",nativePlace:"Original"});
});
