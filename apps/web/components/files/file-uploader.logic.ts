interface BuildFileUploadFormDataOptions {
  file: Blob;
  fileName?: string;
  bizType: string;
  bizId?: string;
  remark?: string;
  uploadPath: string;
}

export function buildFileUploadFormData({
  file,
  fileName,
  bizType,
  bizId,
  remark,
  uploadPath
}: BuildFileUploadFormDataOptions): FormData {
  const form = new FormData();
  if (fileName) {
    form.set("file", file, fileName);
  } else {
    form.set("file", file);
  }

  if (isGenericFileUploadPath(uploadPath)) {
    form.set("biz_type", bizType);
    if (bizId) {
      form.set("biz_id", bizId);
    }
  }

  const normalizedRemark = remark?.trim();
  if (normalizedRemark) {
    form.set("remark", normalizedRemark);
  }
  return form;
}

function isGenericFileUploadPath(uploadPath: string): boolean {
  return uploadPath.split("?", 1)[0] === "/files";
}
