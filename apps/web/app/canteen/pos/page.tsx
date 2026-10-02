"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canteenApi } from "../../../lib/canteen-api";
import { ApiError } from "../../../lib/api-client";
import { getAccessToken, getAuthUser } from "../../../lib/authz";
import styles from "./pos.module.css";
import type { PosEmployeeLookup, PosCheckoutSubsidyResult } from "../../../lib/canteen-types";

interface PosDish {
  id: string;
  name: string;
  price: number;
  category: string;
  color: string;
  soldout: boolean;
}

interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
}

interface ShiftState {
  qrTotal: number;
  subsidyTotal: number;
  orders: number;
  refund: number;
}

type ModalKind = "qr" | "subsidy" | "close" | "lookup" | null;

/* 演示兜底数据：后端 M1 接口未就绪时，POS 仍可完整点单/走流程（界面与冻结原型一致）。 */
const DEMO_DISHES: PosDish[] = [
  { id: "d01", name: "红烧肉土豆", price: 16, category: "招牌热菜", color: "#c0563b", soldout: false },
  { id: "d02", name: "香煎鸡腿排", price: 14.5, category: "招牌热菜", color: "#b9772a", soldout: false },
  { id: "d03", name: "青椒牛柳", price: 18, category: "招牌热菜", color: "#3f8f4f", soldout: false },
  { id: "d04", name: "麻婆豆腐", price: 9, category: "招牌热菜", color: "#b23a2f", soldout: true },
  { id: "d05", name: "西红柿炒蛋", price: 10, category: "招牌热菜", color: "#d66a4a", soldout: false },
  { id: "d06", name: "清蒸鲈鱼", price: 22, category: "招牌热菜", color: "#4a86c4", soldout: false },
  { id: "d07", name: "干锅花菜", price: 11, category: "招牌热菜", color: "#5a9e4a", soldout: false },
  { id: "d08", name: "糖醋里脊", price: 15, category: "招牌热菜", color: "#c98a2a", soldout: false },
  { id: "d09", name: "手撕包菜", price: 8, category: "招牌热菜", color: "#6aa84f", soldout: false },
  { id: "d10", name: "红烧丸子", price: 13, category: "招牌热菜", color: "#a85a3a", soldout: false },
  { id: "d13", name: "五常米饭", price: 2, category: "主食", color: "#8a97a8", soldout: false },
  { id: "d14", name: "手工馒头", price: 1.5, category: "主食", color: "#c9a86a", soldout: false },
  { id: "d15", name: "酱油炒饭", price: 8, category: "主食", color: "#a8743a", soldout: false },
  { id: "d16", name: "青菜面", price: 9, category: "主食", color: "#7aa84f", soldout: false },
  { id: "d17", name: "凉拌黄瓜", price: 4, category: "凉菜小碟", color: "#4a9e5c", soldout: false },
  { id: "d18", name: "卤蛋", price: 2.5, category: "凉菜小碟", color: "#b08545", soldout: false },
  { id: "d19", name: "泡椒凤爪", price: 6, category: "凉菜小碟", color: "#d66a6a", soldout: false },
  { id: "d21", name: "紫菜蛋花汤", price: 3, category: "汤品", color: "#5a86c4", soldout: false },
  { id: "d22", name: "玉米排骨汤", price: 7, category: "汤品", color: "#c08a3a", soldout: false },
  { id: "d25", name: "无糖豆浆", price: 3.5, category: "饮品", color: "#d8c68a", soldout: false },
  { id: "d26", name: "酸梅汤", price: 4, category: "饮品", color: "#7a4a8c", soldout: true }
];
const DEMO_CATS = ["招牌热菜", "主食", "凉菜小碟", "汤品", "饮品"];
const PERIODS = ["早餐", "午餐", "晚餐"];
const COUNTDOWN_SECONDS = 120;

export default function PosTerminalPage() {
  const user = getAuthUser();
  const token = getAccessToken();

  const [outletName, setOutletName] = useState("智慧园区餐厅 · 一楼综合档口");
  const [outletId, setOutletId] = useState("");
  const [dishes, setDishes] = useState<PosDish[]>(DEMO_DISHES);
  const [cats, setCats] = useState<string[]>(DEMO_CATS);
  const [demoMode, setDemoMode] = useState(true);

  const [period, setPeriod] = useState("午餐");
  const [activeCat, setActiveCat] = useState(DEMO_CATS[0]);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftNo, setShiftNo] = useState("");
  const [shift, setShift] = useState<ShiftState>({ qrTotal: 0, subsidyTotal: 0, orders: 0, refund: 0 });
  const [online, setOnline] = useState(true);

  const [modal, setModal] = useState<ModalKind>(null);
  const [qrInfo, setQrInfo] = useState({ orderNo: "", paymentNo: "", amount: "0.00", codeUrl: "", demo: false, subsidyAmount: "0.00", qrAmount: "0.00", isMixed: false });
  const [remain, setRemain] = useState(COUNTDOWN_SECONDS);
  const [showSuccess, setShowSuccess] = useState<{ amount: string; sub: string; subsidyAmount?: string; qrAmount?: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  /* 员工识别（餐补/混合支付共用） */
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState<PosEmployeeLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ====== 初始化：拉档口/餐品/当前班次；失败则演示兜底 ====== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outlets = await canteenApi.listOutlets(token);
        if (cancelled) return;
        const firstOutlet = outlets[0];
        if (firstOutlet) {
          setOutletId(firstOutlet.id);
          setOutletName(firstOutlet.name);
          try {
            const [catList, dishList] = await Promise.all([
              canteenApi.listCategories(firstOutlet.id, token),
              canteenApi.listDishes(firstOutlet.id, { status: "on_shelf" }, token)
            ]);
            if (cancelled) return;
            const firstCat = catList[0];
            if (catList.length > 0 && firstCat) {
              setCats(catList.map((c) => c.name));
              setActiveCat(firstCat.name);
            }
            if (dishList.length > 0) {
              const catNameById = new Map(catList.map((c) => [c.id, c.name]));
              setDishes(
                dishList.map((d) => ({
                  id: d.id,
                  name: d.name,
                  price: Number(d.price),
                  category: (d.categoryId && catNameById.get(d.categoryId)) ?? firstCat?.name ?? "全部",
                  color: "#1f4e8c",
                  soldout: d.status !== "on_shelf"
                }))
              );
              setDemoMode(false);
            }
          } catch {
            /* 餐品接口未就绪，保留演示数据 */
          }
        }
        try {
          const current = await canteenApi.getCurrentSession(token);
          if (cancelled) return;
          if (current) {
            setShiftOpen(current.status === "open");
            setShiftNo(current.sessionNo ?? "");
          }
        } catch {
          /* 无班次视为未开班 */
        }
      } catch {
        /* 档口接口未就绪：保留演示档口/餐品 */
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  /* ====== 联网状态 ====== */
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /* ====== 1920x1080 舞台等比缩放 ====== */
  useEffect(() => {
    const stage = document.getElementById("posStage");
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      if (stage) stage.style.transform = `scale(${s})`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }

  // 弹层挂载后 canvas 才存在，此时再绘制二维码
  useEffect(() => {
    if (modal === "qr" && canvasRef.current) {
      void renderQr(qrInfo.codeUrl);
    }
  }, [modal, qrInfo]);

  const cartTotal = useMemo(() => cart.reduce((s, it) => s + it.price * it.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, it) => s + it.qty, 0), [cart]);
  const visibleDishes = useMemo(() => dishes.filter((d) => d.category === activeCat), [dishes, activeCat]);

  function addToCart(dish: PosDish) {
    if (dish.soldout) return;
    setCart((current) => {
      const ex = current.find((it) => it.id === dish.id);
      if (ex) return current.map((it) => (it.id === dish.id ? { ...it, qty: it.qty + 1 } : it));
      return [...current, { id: dish.id, name: dish.name, price: dish.price, qty: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((current) =>
      current
        .map((it) => (it.id === id ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0)
    );
  }

  function removeLine(id: string) {
    setCart((current) => current.filter((it) => it.id !== id));
  }

  function clearCart() {
    if (cart.length === 0) return;
    setCart([]);
    toast("账单已清空");
  }

  /* ====== 开班 ====== */
  async function openShift() {
    try {
      const session = await canteenApi.openSession({ outlet_id: outletId, opening_float: 0 }, token);
      setShiftNo(session.sessionNo ?? "");
    } catch {
      setShiftNo("CS" + Date.now().toString().slice(-8));
    }
    setShiftOpen(true);
    setShift({ qrTotal: 0, subsidyTotal: 0, orders: 0, refund: 0 });
    toast("已开班" + (shiftNo ? `，班次号 ${shiftNo}` : ""));
  }

  /* ====== 结班/日结 ====== */
  function requestCloseShift() {
    if (!shiftOpen) return toast("当前无进行中班次");
    setModal("close");
  }

  async function confirmCloseShift() {
    try {
      if (outletId) await canteenApi.closeSession(outletId, token);
    } catch {
      /* 后端未就绪，前端照常结班 */
    }
    setShiftOpen(false);
    setModal(null);
    toast("日结完成，数据已上报管理端 / 财务端");
  }

  /* ====== 扫码收款 ====== */
  function stopCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  }
  function stopPolling() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  const startCountdown = useCallback((onTimeout: () => void) => {
    stopCountdown();
    setRemain(COUNTDOWN_SECONDS);
    countdownRef.current = setInterval(() => {
      setRemain((prev) => {
        if (prev <= 1) {
          stopCountdown();
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startPolling = useCallback(
    (paymentNo: string, onPaid: () => void, onEnd: () => void) => {
      stopPolling();
      let attempts = 0;
      const tick = async () => {
        try {
          const st = await canteenApi.getPaymentStatus(paymentNo, token);
          if (st.status === "paid") {
            stopPolling();
            onPaid();
            return;
          }
          if (st.status === "closed" || st.status === "failed") {
            stopPolling();
            onEnd();
            return;
          }
        } catch {
          /* 单次轮询失败，继续下一轮 */
        }
        // 先密后疏：前 4 次 1.5s，之后 3s
        attempts += 1;
        const delay = attempts <= 4 ? 1500 : 3000;
        pollRef.current = setTimeout(tick, delay);
      };
      pollRef.current = setTimeout(tick, 1500);
    },
    [token]
  );

  async function renderQr(text: string) {
    if (!canvasRef.current) return;
    try {
      await QRCode.toCanvas(canvasRef.current, text || "https://pay.example.canteen/", { width: 240, margin: 1 });
    } catch {
      /* 渲染失败保留空白 */
    }
  }

  async function clickQrPay() {
    if (!shiftOpen) return toast("请先开班");
    if (cart.length === 0) return toast("请先点餐");
    if (!online) return toast("当前离线：请恢复网络后再扫码收款");

    const amount = cartTotal.toFixed(2);
    let orderNo = "";
    let paymentNo = "";
    let codeUrl = "";
    let demo = false;

    try {
      const res = await canteenApi.checkoutQr(
        { outlet_id: outletId, channel: "qr_pay", items: cart.map((it) => ({ dish_id: it.id, qty: it.qty })) },
        token
      );
      orderNo = res.order_no;
      paymentNo = res.payment_no;
      codeUrl = res.code_url;
    } catch {
      // 后端 M1 收款接口未就绪：进入演示下单，二维码用占位串
      demo = true;
      orderNo = "SO" + Date.now().toString().slice(-8);
      paymentNo = "CP" + Date.now().toString().slice(-8);
      codeUrl = "DEMO-canteen-qrcode-" + paymentNo;
    }

    setQrInfo({ orderNo, paymentNo, amount, codeUrl, demo, subsidyAmount: "0.00", qrAmount: amount, isMixed: false });
    setModal("qr");

    const settle = () => {
      stopCountdown();
      stopPolling();
      setModal(null);
      toast("支付超时，订单已关单");
    };
    const onPaid = () => {
      stopCountdown();
      stopPolling();
      finishOrder(amount, "二维码收款成功 · 已到账统一收款账户", "小票已打印（可选）", "qr");
    };
    startCountdown(settle);
    if (!demo) startPolling(paymentNo, onPaid, () => { stopCountdown(); setModal(null); toast("支付已关单"); });
  }

  /* 演示模式下“模拟支付成功” */
  function demoPaySuccess() {
    stopCountdown();
    stopPolling();
    finishOrder(qrInfo.amount, "二维码收款成功（演示）", "小票已打印（可选）", "qr");
  }

  function closeQr() {
    stopCountdown();
    stopPolling();
    setModal(null);
    toast("已取消收款");
  }

  function finishOrder(amount: string, title: string, sub: string, channel: "qr" | "subsidy" | "mixed", subsidyAmount = "0.00", qrAmount = "0.00") {
    setShift((s) => {
      const subAmt = channel === "subsidy" || channel === "mixed" ? Number(subsidyAmount) : 0;
      const qrAmt = channel === "qr" || channel === "mixed" ? Number(qrAmount || amount) : 0;
      return {
        ...s,
        subsidyTotal: s.subsidyTotal + subAmt,
        qrTotal: s.qrTotal + qrAmt,
        orders: s.orders + 1
      };
    });
    setModal(null);
    setShowSuccess({ amount, sub: `${title} · ${sub}`, subsidyAmount, qrAmount });
  }

  function nextCustomer() {
    setShowSuccess(null);
    setCart([]);
  }

  /* ====== 员工餐补 / 混合支付 ====== */
  function cartItems() {
    return cart.map((it) => ({ dish_id: it.id, qty: it.qty }));
  }

  /* 打开员工识别弹层（员工餐补 / 混合支付共用入口） */
  function openEmployeeLookup() {
    if (!shiftOpen) return toast("请先开班");
    if (cart.length === 0) return toast("请先点餐");
    if (!online) return toast("当前离线：请恢复网络后再核销");
    setLookupCode("");
    setLookupResult(null);
    setLookupError("");
    setModal("lookup");
  }

  async function doLookup() {
    const code = lookupCode.trim();
    if (!code) return toast("请输入工号 / 手机号 / 账号，或扫描个人用餐码");
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const r = await canteenApi.lookupEmployee(code, token);
      setLookupResult(r);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "未找到该员工");
    } finally {
      setLookupLoading(false);
    }
  }

  function isInsufficient(err: unknown): { balance: string; need: string; suggest: string } | null {
    if (err instanceof ApiError && err.status === 422) {
      const body = (err.response ?? {}) as Record<string, unknown>;
      const data = ((body.data as Record<string, unknown>) ?? body) as Record<string, unknown>;
      if (body.code === "INSUFFICIENT_SUBSIDY" || data.code === "INSUFFICIENT_SUBSIDY") {
        return { balance: String(data.balance ?? body.balance ?? "0"), need: String(data.need ?? body.need ?? "0"), suggest: String(data.suggest ?? body.suggest ?? "mixed") };
      }
    }
    return null;
  }

  /* 确认核销：先走纯餐补；余额不足则转混合支付 */
  async function confirmSubsidyCheckout() {
    if (!lookupResult) return toast("请先识别员工");
    setSubmitting(true);
    const employeeCode = lookupCode.trim();
    try {
      const res = await canteenApi.checkoutSubsidy(
        { outlet_id: outletId, employee_code: employeeCode, items: cartItems(), channel: "subsidy" },
        token
      );
      onSubsidyPaid(res);
    } catch (err) {
      const lack = isInsufficient(err);
      if (lack) {
        if (lack.suggest === "qr_pay") {
          toast(`餐补余额不足 ¥${lack.balance}，请改用扫码收款`);
          setModal(null);
          return;
        }
        // 转混合支付：餐补扣满 + 差额扫码
        await startMixedCheckout(employeeCode);
      } else {
        toast(err instanceof Error ? err.message : "核销失败");
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* 纯餐补成功：虚拟结账，不产生真实收款 */
  function onSubsidyPaid(res: PosCheckoutSubsidyResult) {
    setModal(null);
    setShowSuccess({
      amount: res.subsidy_amount,
      sub: "餐补核销 · 非现金 · 订单已完成",
      subsidyAmount: res.subsidy_amount,
      qrAmount: "0.00"
    });
    setShift((s) => ({ ...s, subsidyTotal: s.subsidyTotal + Number(res.subsidy_amount), orders: s.orders + 1 }));
    setCart([]);
  }

  /* 混合支付：建 pending 订单 + 差额出码，补贴在扫码成功回调才扣 */
  async function startMixedCheckout(employeeCode: string) {
    const res = await canteenApi.checkoutSubsidy(
      { outlet_id: outletId, employee_code: employeeCode, items: cartItems(), channel: "mixed" },
      token
    );
    const total = (Number(res.subsidy_amount) + Number(res.qr_pay_amount)).toFixed(2);
    setQrInfo({
      orderNo: res.order_no,
      paymentNo: res.payment_no ?? "",
      amount: res.qr_pay_amount ?? "0.00",
      codeUrl: res.code_url ?? "",
      demo: false,
      subsidyAmount: res.subsidy_amount ?? "0.00",
      qrAmount: res.qr_pay_amount ?? "0.00",
      isMixed: true
    });
    setModal("qr");

    const settle = () => {
      stopCountdown();
      stopPolling();
      setModal(null);
      toast("支付超时：未扫码部分未完成，订单已取消，补贴未扣减");
    };
    const onPaid = () => {
      stopCountdown();
      stopPolling();
      finishOrder(total, "混合支付成功", `餐补抵扣 ¥${res.subsidy_amount} + 扫码 ¥${res.qr_pay_amount}`, "mixed", res.subsidy_amount ?? "0.00", res.qr_pay_amount ?? "0.00");
    };
    startCountdown(settle);
    startPolling(res.payment_no ?? "", onPaid, () => { stopCountdown(); setModal(null); toast("支付已关单"); });
  }

  return (
    <div className={styles.viewport}>
      <div id="posStage" className={styles.stage}>
        {/* 顶栏 */}
        <header className={styles.topbar}>
          <div className={styles.outletBlock}>
            <span className={styles.outletName}>{outletName}</span>
            <span className={styles.outletSub}>设备账号：餐厅收银（共用）{demoMode ? " · 演示数据" : ""}</span>
          </div>
          <div className={styles.topDiv} />
          <div className={styles.topMeta}><span>收银员</span><b>{user?.realName ?? "当班"}</b></div>
          <div className={styles.topMeta}><span>业务日期</span><b>{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}</b></div>
          <div className={styles.topMeta}><span>当前餐段</span><b>{period}</b></div>
          <div className={styles.topSpacer} />
          <div className={styles.netPill}>
            <span className={online ? styles.dot : styles.dotOff} />
            <span>{online ? "Wi-Fi 已连接 · 在线" : "离线"}</span>
          </div>
          <div className={styles.shiftPill}>
            班次状态：
            <span className={shiftOpen ? styles.shiftOpen : styles.shiftClosed}>{shiftOpen ? "已开班" : "未开班"}</span>
          </div>
          <button className={`${styles.btnTop} ${styles.btnOpen}`} type="button" onClick={() => void openShift()}>开班</button>
          <button className={`${styles.btnTop} ${styles.btnClose}`} type="button" onClick={requestCloseShift}>结班 / 日结</button>
        </header>

        {/* 主体 */}
        <div className={styles.main}>
          <section className={styles.dishesArea}>
            <div className={styles.periodTabs}>
              {PERIODS.map((p) => (
                <button key={p} className={`${styles.periodTab} ${p === period ? styles.periodTabActive : ""}`} type="button" onClick={() => setPeriod(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className={styles.catRow}>
              {cats.map((c) => (
                <button key={c} className={`${styles.catTab} ${c === activeCat ? styles.catTabActive : ""}`} type="button" onClick={() => setActiveCat(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className={styles.dishGrid}>
              {visibleDishes.map((dish) => (
                <div key={dish.id} className={styles.dishWrap}>
                  <button
                    className={`${styles.dish} ${dish.soldout ? styles.dishOff : ""}`}
                    type="button"
                    disabled={dish.soldout}
                    onClick={() => addToCart(dish)}
                  >
                    <div className={styles.dishImg} style={{ background: dish.color }}>{dish.name.slice(0, 1)}</div>
                    <div className={styles.dishInfo}>
                      <div className={styles.dishName}>{dish.name}</div>
                      <div className={styles.dishTag}>份 · 档口现打</div>
                      <div className={styles.dishPrice}><small>¥</small>{dish.price.toFixed(2)}</div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <aside className={styles.cartPanel}>
            <div className={styles.cartHead}>
              <span className={styles.cartTitle}>当前账单（{cartCount} 件）</span>
              <button className={styles.cartClear} type="button" onClick={clearCart}>清空账单</button>
            </div>
            <div className={styles.cartList}>
              {cart.length === 0 ? (
                <div className={styles.cartEmpty}>
                  <div className={styles.cartEmptyBig}>🍽</div>
                  <div>尚未点单<br />点击左侧餐品加入账单</div>
                </div>
              ) : (
                cart.map((line) => (
                  <div key={line.id} className={styles.cartItem}>
                    <div className={styles.ciTop}>
                      <span className={styles.ciName}>{line.name}</span>
                      <span className={styles.ciPrice}>¥{(line.price * line.qty).toFixed(2)}</span>
                    </div>
                    <div className={styles.ciNote}>单价 ¥{line.price.toFixed(2)}</div>
                    <div className={styles.ciCtrl}>
                      <button className={styles.ciBtn} type="button" onClick={() => changeQty(line.id, -1)}>−</button>
                      <span className={styles.ciQty}>{line.qty}</span>
                      <button className={styles.ciBtn} type="button" onClick={() => changeQty(line.id, 1)}>＋</button>
                      <button className={styles.ciDel} type="button" onClick={() => removeLine(line.id)}>删</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={styles.cartTotal}>
              <div className={styles.ctRow}><span>商品合计</span><span>¥{cartTotal.toFixed(2)}</span></div>
              <div className={`${styles.ctRow} ${styles.ctRowDisc}`}><span>整单折扣（占位）</span><span>-¥0.00</span></div>
              <div className={styles.ctGrand}><span className={styles.ctGrandLab}>应付</span><span className={styles.ctGrandAmt}>¥{cartTotal.toFixed(2)}</span></div>
            </div>
          </aside>
        </div>

        {/* 底部收款区 */}
        <footer className={styles.paybar}>
          <div className={styles.paySummary}>
            <div className={styles.paySummaryT}>本班次已收（实时）</div>
            <div className={styles.paySummaryV}>
              ¥{(shift.qrTotal + shift.subsidyTotal).toFixed(2)}
              <small> 订单 {shift.orders} 笔</small>
            </div>
          </div>
          <div className={styles.payBtns}>
            <button className={`${styles.payBtn} ${styles.btnQr}`} type="button" onClick={() => void clickQrPay()}>
              <span className={styles.payBtnIcon}>▦</span>扫码收款
            </button>
            <button className={`${styles.payBtn} ${styles.btnSubsidy}`} type="button" onClick={() => void openEmployeeLookup()}>
              <span className={styles.payBtnIcon}>★</span>员工餐补
            </button>
          </div>
          <div className={styles.paySide}>
            <button className={styles.mixLink} type="button" onClick={() => void openEmployeeLookup()}>混合支付（M2）</button>
            <button className={styles.mixLink} type="button" onClick={() => toast("退款/撤单：需 canteen-admin 审核（占位）")}>退款 / 撤单（需权限）</button>
          </div>
        </footer>

        {/* 弹层：扫码收款 */}
        {modal === "qr" ? (
          <div className={styles.mask}>
            <div className={`${styles.dialog} ${styles.dialogWide}`}>
              <div className={styles.dlgHead}>
                <span className={styles.dlgTitle}>{qrInfo.isMixed ? "混合支付 · 请顾客扫码支付差额" : "扫码收款 · 请顾客扫码支付"}</span>
                <button className={styles.dlgX} type="button" onClick={closeQr}>×</button>
              </div>
              <div className={styles.dlgBody}>
                <div className={styles.qrWrap}>
                  <div className={styles.qrCanvasBox}>
                    <canvas ref={canvasRef} width={240} height={240} />
                  </div>
                  <div className={styles.qrRight}>
                    {qrInfo.isMixed ? (
                      <>
                        <div className={styles.qrRow}><span>餐补抵扣</span><b>-¥{qrInfo.subsidyAmount}</b></div>
                        <div className={styles.qrAmt}><small>扫码支付差额</small> ¥{qrInfo.qrAmount}</div>
                        <div className={styles.qrRow}>订单号：<b>{qrInfo.orderNo}</b></div>
                      </>
                    ) : (
                      <>
                        <div className={styles.qrAmt}><small>应付</small> ¥{qrInfo.amount}</div>
                        <div className={styles.qrRow}>订单号：<b>{qrInfo.orderNo}</b></div>
                      </>
                    )}
                    <div className={styles.qrRow}>支付倒计时：<span className={`${styles.countdown} ${remain <= 30 ? styles.countdownWarn : ""}`}>{remain}s</span></div>
                    <div className={styles.payChannels}>
                      <span className={`${styles.chPill} ${styles.chPillOn}`}>微信</span>
                      <span className={`${styles.chPill} ${styles.chPillOn}`}>支付宝</span>
                      <span className={styles.chPill}>云闪付</span>
                    </div>
                  </div>
                </div>
                <div className={styles.demoTip}>
                  {qrInfo.demo
                    ? "演示模式：收款接口未联调，二维码为占位图形；点击「模拟支付成功」走完整收银反馈。真实环境由支付平台异步回调 + POS 轮询 /payments/{no}/status 驱动。"
                    : "请顾客使用微信/支付宝扫码；POS 将自动轮询支付状态，支付成功后进入下一单。"}
                </div>
              </div>
              <div className={styles.dlgFoot}>
                <button className={`${styles.btn} ${styles.btnWarn}`} type="button" onClick={closeQr}>超时关单</button>
                {qrInfo.demo ? (
                  <button className={`${styles.btn} ${styles.btnGreen}`} type="button" onClick={demoPaySuccess}>模拟支付成功</button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* 弹层：结班/日结 */}
        {modal === "close" ? (
          <div className={styles.mask}>
            <div className={`${styles.dialog} ${styles.dialogNarrow}`}>
              <div className={styles.dlgHead}>
                <span className={styles.dlgTitle}>收银班次日结 · 确认结班</span>
                <button className={styles.dlgX} type="button" onClick={() => setModal(null)}>×</button>
              </div>
              <div className={styles.dlgBody}>
                <div className={styles.settleGrid}>
                  <div className={styles.sCell}><div className={styles.sCellK}>二维码收款合计（真实资金）</div><div className={`${styles.sCellV} ${styles.sVGreen}`}>¥{shift.qrTotal.toFixed(2)}</div></div>
                  <div className={styles.sCell}><div className={styles.sCellK}>餐补核销合计（虚拟）</div><div className={`${styles.sCellV} ${styles.sVBlue}`}>¥{shift.subsidyTotal.toFixed(2)}</div></div>
                  <div className={styles.sCell}><div className={styles.sCellK}>订单数</div><div className={styles.sCellV}>{shift.orders}</div></div>
                  <div className={styles.sCell}><div className={styles.sCellK}>退款 / 撤单数</div><div className={`${styles.sCellV} ${styles.sVRed}`}>{shift.refund}</div></div>
                </div>
              </div>
              <div className={styles.dlgFoot}>
                <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setModal(null)}>再等一会</button>
                <button className={`${styles.btn} ${styles.btnWarn}`} type="button" onClick={() => void confirmCloseShift()}>确认结班</button>
              </div>
            </div>
          </div>
        ) : null}

        {/* 弹层：员工识别（餐补/混合支付） */}
        {modal === "lookup" ? (
          <div className={styles.mask}>
            <div className={`${styles.dialog} ${styles.dialogNarrow}`}>
              <div className={styles.dlgHead}>
                <span className={styles.dlgTitle}>员工餐补 · 识别员工</span>
                <button className={styles.dlgX} type="button" onClick={() => setModal(null)}>×</button>
              </div>
              <div className={styles.dlgBody}>
                <div className={styles.lookupRow}>
                  <input
                    className={styles.lookupInput}
                    placeholder="工号 / 手机号 / 账号，或扫描个人码"
                    value={lookupCode}
                    onChange={(e) => { setLookupCode(e.target.value); setLookupResult(null); setLookupError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void doLookup(); }}
                    autoFocus
                  />
                  <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => void doLookup()} disabled={lookupLoading}>
                    {lookupLoading ? "识别中…" : "识别"}
                  </button>
                </div>
                {lookupError ? <div className={styles.lookupError}>{lookupError}</div> : null}
                {lookupResult ? (
                  <div className={styles.empCard}>
                    <div className={styles.empName}>{lookupResult.name_masked}</div>
                    <div className={styles.empGrid}>
                      <div><span>本期额度</span><b>¥{lookupResult.period_grant}</b></div>
                      <div><span>已用</span><b>¥{lookupResult.period_consumed}</b></div>
                      <div><span>剩余可用</span><b className={styles.empBalance}>¥{lookupResult.period_balance}</b></div>
                      <div><span>到期日</span><b>{lookupResult.expire_date ?? "—"}</b></div>
                    </div>
                    <div className={styles.lookupBill}>
                      <span>本单合计</span><b>¥{cartTotal.toFixed(2)}</b>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles.dlgFoot}>
                <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setModal(null)}>取消</button>
                <button className={`${styles.btn} ${styles.btnGreen}`} type="button" onClick={() => void confirmSubsidyCheckout()} disabled={!lookupResult || submitting}>
                  {submitting ? "核销中…" : "确认核销"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* 成功全屏 */}
        {showSuccess ? (
          <div className={styles.success}>
            <div className={styles.successCheck}>✓</div>
            <h2>{showSuccess.qrAmount && Number(showSuccess.qrAmount) > 0 ? "支付成功" : "核销成功"}</h2>
            <div className={styles.successAmt}>¥{showSuccess.amount}</div>
            {showSuccess.subsidyAmount && Number(showSuccess.subsidyAmount) > 0 ? (
              <div className={styles.successSplit}>
                <div className={styles.successSplitRow}><span>餐补抵扣（非现金）</span><b>¥{showSuccess.subsidyAmount}</b></div>
                {showSuccess.qrAmount && Number(showSuccess.qrAmount) > 0 ? (
                  <div className={styles.successSplitRow}><span>扫码支付（真实）</span><b>¥{showSuccess.qrAmount}</b></div>
                ) : null}
              </div>
            ) : null}
            <div className={styles.successSub}>{showSuccess.sub}</div>
            <button className={styles.btnNext} type="button" onClick={nextCustomer}>下一位 →</button>
          </div>
        ) : null}

        {toastMsg ? <div className={styles.toast}>{toastMsg}</div> : null}
      </div>
    </div>
  );
}
