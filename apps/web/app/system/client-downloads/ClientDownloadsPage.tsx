"use client";

import { AlertCircle, CheckCircle2, Download, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { formatBinarySize, parseAndroidReleaseManifest, type AndroidReleaseManifest } from "../../../lib/android-release";
import styles from "./client-downloads.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; release: AndroidReleaseManifest }
  | { status: "error"; message: string };

export function ClientDownloadsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/downloads/android/latest.json", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "Android 客户端正在发布中，请稍后再试" : "客户端版本信息加载失败");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => setState({ status: "ready", release: parseAndroidReleaseManifest(payload) }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "客户端版本信息加载失败" });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className={`ds-page ${styles.page}`}>
      <section className={`ds-hero ${styles.hero}`}>
        <div className="ds-hero-copy">
          <span className={styles.eyebrow}>园区移动客户端</span>
          <h1>客户端下载</h1>
          <p>安装金湖智慧园区 Android 客户端，直接从手机桌面进入巡检、工单和现场作业。</p>
        </div>
        <Smartphone aria-hidden="true" className={styles.heroIcon} size={72} />
      </section>

      <section className={`ds-panel ${styles.panel}`} aria-live="polite">
        {state.status === "loading" ? (
          <div className={styles.state}><LoaderCircle className={styles.spin} size={28} /><strong>正在获取最新版本…</strong></div>
        ) : state.status === "error" ? (
          <div className={styles.state}><AlertCircle size={28} /><strong>{state.message}</strong><span>如持续无法下载，请联系园区管理员。</span></div>
        ) : (
          <>
            <div className={styles.releaseHeader}>
              <div className={styles.appIcon}><Smartphone size={34} /></div>
              <div>
                <span className={styles.platform}>Android 7.0 及以上</span>
                <h2>金湖智慧园区 v{state.release.versionName}</h2>
                <p>{state.release.releaseNotes}</p>
              </div>
            </div>

            <dl className={styles.metadata}>
              <div><dt>版本号</dt><dd>{state.release.versionCode}</dd></div>
              <div><dt>文件大小</dt><dd>{formatBinarySize(state.release.sizeBytes)}</dd></div>
              <div><dt>发布时间</dt><dd>{new Date(state.release.builtAt).toLocaleString("zh-CN", { hour12: false })}</dd></div>
            </dl>

            <a className={`ds-button-primary ${styles.downloadButton}`} download={state.release.fileName} href={state.release.downloadUrl}>
              <Download size={19} />下载 Android 客户端
            </a>

            <div className={styles.securityNote}>
              <ShieldCheck size={20} />
              <span><strong>园区官方版本</strong>，安装包已使用固定证书签名，并提供 SHA-256 完整性校验。</span>
            </div>
            <details className={styles.hash}>
              <summary>查看安装包校验值</summary>
              <code>{state.release.sha256}</code>
            </details>
          </>
        )}
      </section>

      <section className={`ds-panel ${styles.instructions}`}>
        <h2>安装方法</h2>
        <ol>
          <li><CheckCircle2 size={18} /><span>点击上方按钮下载 APK。</span></li>
          <li><CheckCircle2 size={18} /><span>浏览器询问时，允许本次来源安装应用。</span></li>
          <li><CheckCircle2 size={18} /><span>安装完成后打开“金湖智慧园区”，使用现有园区账号登录。</span></li>
        </ol>
      </section>
    </main>
  );
}
