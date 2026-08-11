import assert from "node:assert/strict";
import test from "node:test";
import { buildFileUploadFormData } from "./file-uploader.logic";

const file = new File(["floor plan"], "一层平面图.png", { type: "image/png" });

test("generic file uploads include client-owned business association fields", () => {
  const form = buildFileUploadFormData({
    file,
    bizType: "general",
    bizId: "64556c5d-002c-44c6-8467-d5b85970cf38",
    remark: "  现场图  ",
    uploadPath: "/files"
  });

  assert.equal(form.get("file"), file);
  assert.equal(form.get("biz_type"), "general");
  assert.equal(form.get("biz_id"), "64556c5d-002c-44c6-8467-d5b85970cf38");
  assert.equal(form.get("remark"), "现场图");
});

test("domain upload routes omit association fields owned by the route adapter", () => {
  const form = buildFileUploadFormData({
    file,
    bizType: "floorplan",
    bizId: "dfbe7003-8c85-4f14-841e-76f7491ad700",
    remark: "楼层布局",
    uploadPath: "/floors/dfbe7003-8c85-4f14-841e-76f7491ad700/layout"
  });

  assert.equal(form.get("file"), file);
  assert.equal(form.get("biz_type"), null);
  assert.equal(form.get("biz_id"), null);
  assert.equal(form.get("remark"), "楼层布局");
});

test("recovered blobs retain their filename without leaking generic association fields", () => {
  const blob = new Blob(["offline floor plan"], { type: "image/png" });
  const form = buildFileUploadFormData({
    file: blob,
    fileName: "离线恢复平面图.png",
    bizType: "floorplan",
    bizId: "dfbe7003-8c85-4f14-841e-76f7491ad700",
    uploadPath: "/floors/dfbe7003-8c85-4f14-841e-76f7491ad700/layout"
  });

  const recoveredFile = form.get("file");
  assert.ok(recoveredFile instanceof File);
  assert.equal(recoveredFile.name, "离线恢复平面图.png");
  assert.equal(form.get("biz_type"), null);
  assert.equal(form.get("biz_id"), null);
});
