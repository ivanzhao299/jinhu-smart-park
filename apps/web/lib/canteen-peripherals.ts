/**
 * 园区餐厅 POS 外设抽象（M4 占位实现）。
 *
 * 目的：把小票打印机、扫码枪等硬件从业务代码中解耦。当前为演示/联调环境，
 * 不内置任何厂商型号、USB HID / 网口驱动，也不引入重型依赖。
 *
 * 后续接入真实设备时，只需：
 *   1) 实现下面的 ReceiptPrinter / BarcodeScanner 接口；
 *   2) 在 getReceiptPrinter() / createBarcodeScanner() 里按配置选择实现；
 *   3) 业务代码无需改动。
 *
 * 设备选择走环境变量（构建期注入）：
 *   NEXT_PUBLIC_CANTEEN_PRINTER = "" | "null" | "browser" | "<driver-name>"
 *   缺省为 null/占位，绝不默认打印。
 */

/* ---------------- 小票打印机 ---------------- */

export interface ReceiptPrintPayload {
  orderNo: string;
  amount: string;
  channel: string;
  lines: Array<{ name: string; qty: number; price: string }>;
  operator?: string;
  timestamp?: string;
}

export interface ReceiptPrinter {
  /** 是否有可用打印机（已连接/驱动就绪）。 */
  isAvailable(): boolean;
  /** 打印小票；未连接时应抛出或由调用方判断 isAvailable。 */
  printReceipt(payload: ReceiptPrintPayload): Promise<void>;
}

/** 空实现：明确告知「未连接」，不再假装已打印。 */
class NullReceiptPrinter implements ReceiptPrinter {
  isAvailable(): boolean {
    return false;
  }
  async printReceipt(): Promise<void> {
    throw new Error("演示环境未连接小票打印机");
  }
}

/** 浏览器占位实现：仅把小票内容打到控制台，不连接物理设备。 */
class BrowserReceiptPrinter implements ReceiptPrinter {
  isAvailable(): boolean {
    return false;
  }
  async printReceipt(payload: ReceiptPrintPayload): Promise<void> {
    // eslint-disable-next-line no-console
    console.info("[browser-printer] 小票占位（未连接物理打印机）", payload);
  }
}

let cachedPrinter: ReceiptPrinter | null = null;

export function getReceiptPrinter(): ReceiptPrinter {
  if (cachedPrinter) return cachedPrinter;
  const kind = (process.env.NEXT_PUBLIC_CANTEEN_PRINTER ?? "null").trim().toLowerCase();
  // 真实驱动（如 "network-80mm" / "escpos-usb"）在此分支挂载；目前仅占位。
  cachedPrinter = kind === "browser" ? new BrowserReceiptPrinter() : new NullReceiptPrinter();
  return cachedPrinter;
}

/** 收款成功后调用：可用才打印，不可用返回如实提示文案。 */
export async function tryPrintReceipt(
  payload: ReceiptPrintPayload
): Promise<{ printed: boolean; note: string }> {
  const printer = getReceiptPrinter();
  if (!printer.isAvailable()) {
    return { printed: false, note: "演示环境未连接小票打印机（跳过打印）" };
  }
  try {
    await printer.printReceipt(payload);
    return { printed: true, note: "小票已打印" };
  } catch (error) {
    return { printed: false, note: error instanceof Error ? error.message : "小票打印失败" };
  }
}

/* ---------------- 扫码枪（键盘楔入） ---------------- */

export type BarcodeScanHandler = (code: string) => void;

export interface BarcodeScanner {
  /** 开始监听，返回取消监听函数。 */
  start(onScan: BarcodeScanHandler): () => void;
}

/**
 * 键盘楔入占位：扫码枪多数以 USB HID Keyboard 形式工作（快速连续字符 + 回车）。
 * 这里按「短时间内连续按键并以 Enter 结束」聚合为一次扫码，不直连 HID。
 */
export class KeyboardWedgeScanner implements BarcodeScanner {
  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly gapMs: number;

  constructor(gapMs = 80) {
    this.gapMs = gapMs;
  }

  start(onScan: BarcodeScanHandler): () => void {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // 在输入框里正常输入，不拦截（避免影响手输）。
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "Enter") {
        const code = this.buffer.trim();
        this.buffer = "";
        if (code.length >= 4) onScan(code);
        return;
      }
      if (e.key.length === 1) {
        this.buffer += e.key;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.buffer = "";
        }, this.gapMs * 3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (this.timer) clearTimeout(this.timer);
    };
  }
}
