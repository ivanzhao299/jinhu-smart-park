"use client";

import { useState } from "react";

export function trainingMemoPayload(form: FormData): { memo?: string | null } {
  const action = form.get("memoAction");
  if (action === "clear") return { memo: null };
  if (action === "write") return { memo: String(form.get("memo") ?? "") };
  return {};
}

export function TrainingMemoFields({ memo }: { memo?: string | null }) {
  const [action, setAction] = useState("preserve");
  return (
    <>
      <label className="form-field">
        <span>培训备注操作</span>
        <select name="memoAction" value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="preserve">保持原备注</option>
          <option value="write">填写或修改备注</option>
          <option value="clear">清空备注</option>
        </select>
      </label>
      {action === "write" ? (
        <label className="form-field">
          <span>培训备注</span>
          <textarea name="memo" maxLength={2000} defaultValue={typeof memo === "string" ? memo : ""} />
        </label>
      ) : null}
    </>
  );
}
