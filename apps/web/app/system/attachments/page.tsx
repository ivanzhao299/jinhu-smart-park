"use client";
import { Card } from "@jinhu/ui";

import { Plus } from "lucide-react";
import { useState } from "react";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { PermissionButton } from "../../../components/permission-button";

export default function AttachmentsPage() {
  const [bizType, setBizType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const effectiveBizType = bizType || "system";

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>附件中心</strong>
          <span>本地文件存储已启用，存储接口预留 MinIO / OSS 切换能力</span>
        </div>
        <PermissionButton
          className="primary-button"
          permission={SYSTEM_PERMISSIONS.FILE_UPLOAD}
          type="button"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={16} />
          新增附件
        </PermissionButton>
      </header>

      <Card >
        <div className="field">
          <label htmlFor="bizType">业务类型</label>
          <input id="bizType" value={bizType} onChange={(event) => setBizType(event.target.value)} placeholder="system / contract / workorder" />
        </div>
      </Card>

      {showCreate ? (
        <section className="login-panel floating-panel">
          <div className="task-item">
            <h2 className="panel-title">上传附件</h2>
            <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>关闭</button>
          </div>
          <FileUploader bizType={effectiveBizType} onUploaded={() => { setRefreshKey((value) => value + 1); setShowCreate(false); }} />
        </section>
      ) : null}
      <AttachmentList bizType={effectiveBizType} refreshKey={refreshKey} />
    </main>
  );
}
