"use client";

import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import {
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  DrawerSection,
  EmptyState,
  ErrorState,
  FeedbackNotice,
  FilterPanel,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
  Tabs
} from "@jinhu/ui";
import { AlertTriangle, BookOpen, ChevronDown, Plus, RefreshCw, Save, Search, Trash, Upload } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenCategory, CanteenDish, CanteenOutlet } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";

interface Filters {
  outletId: string;
  categoryId: string;
  status: string;
  keyword: string;
}

interface DishFormState {
  outlet_id: string;
  category_id: string;
  name: string;
  price: string;
  unit: string;
  barcode: string;
  daily_stock: string;
  need_booking: boolean;
}

const emptyDishForm: DishFormState = {
  outlet_id: "",
  category_id: "",
  name: "",
  price: "",
  unit: "份",
  barcode: "",
  daily_stock: "",
  need_booking: false
};

interface CategoryFormState {
  name: string;
  sort_order: string;
  status: "on" | "off";
}

const emptyCategoryForm: CategoryFormState = { name: "", sort_order: "0", status: "on" };

type ViewKind = "dishes" | "categories";

export default function CanteenDishesPage() {
  const [view, setView] = useState<ViewKind>("dishes");
  const [outlets, setOutlets] = useState<CanteenOutlet[]>([]);
  const [outletsError, setOutletsError] = useState("");
  const [filters, setFilters] = useState<Filters>({ outletId: "", categoryId: "", status: "", keyword: "" });
  const [categories, setCategories] = useState<CanteenCategory[]>([]);
  const [dishes, setDishes] = useState<CanteenDish[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [dishDrawer, setDishDrawer] = useState<{ mode: "create" | "edit"; dish: CanteenDish | null } | null>(null);
  const [dishForm, setDishForm] = useState<DishFormState>(emptyDishForm);
  const [moreOpen, setMoreOpen] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState<{ mode: "create" | "edit"; category: CanteenCategory | null } | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [detailDish, setDetailDish] = useState<CanteenDish | null>(null);

  const selectedOutlet = outlets.find((o) => o.id === filters.outletId) ?? outlets[0];

  const loadOutlets = useCallback(async () => {
    try {
      const list = await canteenApi.listOutlets(getAccessToken());
      setOutlets(list);
      setOutletsError("");
      setFilters((current) => (current.outletId ? current : { ...current, outletId: list[0]?.id ?? "" }));
    } catch (error) {
      setOutletsError(error instanceof Error ? error.message : "加载档口失败");
    }
  }, []);

  const outletId = filters.outletId || outlets[0]?.id || "";

  const loadCategories = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const list = await canteenApi.listCategories(id, getAccessToken());
      setCategories(list);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载品类失败");
    }
  }, []);

  const loadDishes = useCallback(async (id: string) => {
    if (!id) {
      setDishes([]);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const list = await canteenApi.listDishes(
        id,
        { category_id: filters.categoryId || undefined, status: filters.status || undefined, keyword: filters.keyword.trim() || undefined },
        getAccessToken()
      );
      setDishes(list);
      setSelectedIds(new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载餐品失败");
      setDishes([]);
    } finally {
      setLoading(false);
    }
  }, [filters.categoryId, filters.status, filters.keyword]);

  useEffect(() => {
    void loadOutlets();
  }, [loadOutlets]);

  useEffect(() => {
    if (!outletId) return;
    void loadCategories(outletId);
  }, [outletId, loadCategories]);

  useEffect(() => {
    void loadDishes(outletId);
  }, [outletId, loadDishes]);

  const summary = useMemo(() => {
    const onShelf = dishes.filter((d) => d.status === "on_shelf").length;
    return {
      total: dishes.length,
      onShelf,
      offShelf: dishes.length - onShelf,
      categories: categories.length
    };
  }, [dishes, categories]);

  // 餐品列表不回品类名，按 categoryId 映射已加载品类
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  async function saveDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dishDrawer) return;
    if (!dishForm.name.trim()) throw new Error("请填写餐品名称");
    if (!dishForm.category_id) throw new Error("请选择品类");
    const price = Number(dishForm.price);
    if (!Number.isFinite(price) || price < 0) throw new Error("请填写正确的价格");
    const payload = {
      outlet_id: outletId,
      category_id: dishForm.category_id,
      name: dishForm.name.trim(),
      price,
      unit: dishForm.unit.trim() || "份",
      barcode: dishForm.barcode.trim() || undefined,
      daily_stock: dishForm.daily_stock === "" ? null : Number(dishForm.daily_stock),
      need_booking: dishForm.need_booking
    };
    if (dishDrawer.mode === "create") {
      await canteenApi.createDish(payload, getAccessToken());
      setMessage("餐品已创建");
    } else if (dishDrawer.dish) {
      await canteenApi.updateDish(dishDrawer.dish.id, payload, getAccessToken());
      setMessage("餐品已更新");
    }
    setDishDrawer(null);
    await loadDishes(outletId);
  }

  async function toggleShelf(dish: CanteenDish) {
    const next = dish.status === "on_shelf" ? "off_shelf" : "on_shelf";
    await canteenApi.updateDishShelf(dish.id, { status: next }, getAccessToken());
    setMessage(next === "on_shelf" ? `餐品「${dish.name}」已上架` : `餐品「${dish.name}」已下架`);
    await loadDishes(outletId);
  }

  /* 批量上下架：对所选 id 逐个调现有 PATCH shelf，各带幂等键（client 内部生成） */
  async function batchShelf(next: "on_shelf" | "off_shelf") {
    const targets = dishes.filter((d) => selectedIds.has(d.id));
    if (targets.length === 0) return;
    setBatchBusy(true);
    try {
      let ok = 0;
      for (const d of targets) {
        try {
          await canteenApi.updateDishShelf(d.id, { status: next }, getAccessToken());
          ok += 1;
        } catch {
          /* 单个失败不中断其余，最终汇总提示 */
        }
      }
      const verb = next === "on_shelf" ? "上架" : "下架";
      setMessage(`已批量${verb} ${ok}/${targets.length} 款`);
      setSelectedIds(new Set());
      await loadDishes(outletId);
    } finally {
      setBatchBusy(false);
    }
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(dishes.map((d) => d.id)) : new Set());
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryDrawer) return;
    if (!categoryForm.name.trim()) throw new Error("请填写品类名称");
    const payload = {
      name: categoryForm.name.trim(),
      sort_order: Number(categoryForm.sort_order) || 0,
      status: categoryForm.status
    };
    if (categoryDrawer.mode === "create") {
      await canteenApi.createCategory(outletId, payload, getAccessToken());
      setMessage("品类已创建");
    } else if (categoryDrawer.category) {
      await canteenApi.updateCategory(categoryDrawer.category.id, payload, getAccessToken());
      setMessage("品类已更新");
    }
    setCategoryDrawer(null);
    await loadCategories(outletId);
  }

  async function removeCategory(category: CanteenCategory) {
    await canteenApi.deleteCategory(category.id, getAccessToken());
    setMessage(`品类「${category.name}」已删除`);
    await loadCategories(outletId);
  }

  function openDishCreate() {
    setDishForm({ ...emptyDishForm, outlet_id: outletId });
    setMoreOpen(false);
    setDishDrawer({ mode: "create", dish: null });
  }

  function openDishEdit(dish: CanteenDish) {
    setDishForm({
      outlet_id: outletId,
      category_id: dish.categoryId ?? "",
      name: dish.name,
      price: dish.price,
      unit: dish.unit,
      barcode: dish.barcode ?? "",
      daily_stock: dish.dailyStock == null ? "" : String(dish.dailyStock),
      need_booking: Boolean(dish.needBooking)
    });
    setMoreOpen(true);
    setDishDrawer({ mode: "edit", dish });
  }

  function openCategoryCreate() {
    setCategoryForm(emptyCategoryForm);
    setCategoryDrawer({ mode: "create", category: null });
  }

  function openCategoryEdit(category: CanteenCategory) {
    setCategoryForm({ name: category.name, sort_order: String(category.sortOrder), status: (category.status as "on" | "off") ?? "on" });
    setCategoryDrawer({ mode: "edit", category });
  }

  const allChecked = dishes.length > 0 && selectedIds.size === dishes.length;

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.DISH_VIEW}>
      <PageShell className="canteen-dishes-page">
        <PageHeader
          title="餐品与品类管理"
          description="维护档口下的品类与餐品：定价、每日库存、上架/下架。真实收款金额以订单/支付流水为准。"
          actions={
            <>
              <button className="secondary-button" type="button" onClick={() => void loadDishes(outletId).catch((e: Error) => setMessage(e.message))}>
                <RefreshCw size={16} />
                刷新
              </button>
              {view === "dishes" ? (
                <PermissionButton className="primary-button" permission={CANTEEN_PERMISSIONS.DISH_CREATE} type="button" onClick={openDishCreate}>
                  <Plus size={16} />
                  新建餐品
                </PermissionButton>
              ) : (
                <PermissionButton className="primary-button" permission={CANTEEN_PERMISSIONS.CATEGORY_CREATE} type="button" onClick={openCategoryCreate}>
                  <Plus size={16} />
                  新建品类
                </PermissionButton>
              )}
            </>
          }
        />

        <Tabs
          aria-label="餐品 / 品类视图"
          value={view}
          onChange={(v) => setView(v as ViewKind)}
          items={[
            { value: "dishes", label: "餐品", count: summary.total },
            { value: "categories", label: "品类", count: summary.categories }
          ]}
        />

        <FilterPanel>
          <Field label="档口">
            <select value={outletId} onChange={(e) => setFilters((c) => ({ ...c, outletId: e.target.value }))}>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
              {outlets.length === 0 ? <option value="">暂无档口</option> : null}
            </select>
          </Field>
          {view === "dishes" ? (
            <>
              <Field label="品类">
                <select value={filters.categoryId} onChange={(e) => setFilters((c) => ({ ...c, categoryId: e.target.value }))}>
                  <option value="">全部品类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="上架状态">
                <select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
                  <option value="">全部</option>
                  <option value="on_shelf">已上架</option>
                  <option value="off_shelf">已下架</option>
                </select>
              </Field>
              <Field label="关键词">
                <input value={filters.keyword} onChange={(e) => setFilters((c) => ({ ...c, keyword: e.target.value }))} placeholder="餐品名称 / 编码 / 条码" />
              </Field>
              <button className="primary-button" type="button" onClick={() => void loadDishes(outletId).catch((e: Error) => setMessage(e.message))}>
                <Search size={16} />
                查询
              </button>
            </>
          ) : null}
        </FilterPanel>

        {message ? (
          <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>
            {message}
          </FeedbackNotice>
        ) : null}
        {outletsError ? (
          <ErrorState title="档口加载失败" description={outletsError} action={<button className="secondary-button" type="button" onClick={() => void loadOutlets()}>重试</button>} />
        ) : null}

        {view === "dishes" ? (
          <>
            <section className="dashboard-grid canteen-summary-grid">
              <MetricCard icon={<BookOpen size={18} />} label="餐品总数" value={summary.total} />
              <MetricCard icon={<Upload size={18} />} label="已上架" value={summary.onShelf} />
              <MetricCard icon={<Trash size={18} />} label="已下架" value={summary.offShelf} />
              <MetricCard icon={<RefreshCw size={18} />} label="品类数" value={summary.categories} />
            </section>

            <ContentCard
              title="餐品列表"
              description={selectedOutlet ? `当前档口：${selectedOutlet.name}（${selectedOutlet.outletNo || "未编号"}）` : "请先选择档口"}
              actions={<StatusPill variant={loading ? "info" : "success"}>{loading ? "加载中" : `${summary.onShelf} 款在售`}</StatusPill>}
            >
              {selectedIds.size > 0 ? (
                <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>
                  已选 {selectedIds.size} 款
                  <PermissionButton
                    className="primary-button"
                    permission={CANTEEN_PERMISSIONS.DISH_SHELF}
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void batchShelf("on_shelf").catch((e: Error) => setMessage(e.message))}
                  >
                    {batchBusy ? "处理中…" : "批量上架"}
                  </PermissionButton>
                  <PermissionButton
                    className="secondary-button"
                    permission={CANTEEN_PERMISSIONS.DISH_SHELF}
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void batchShelf("off_shelf").catch((e: Error) => setMessage(e.message))}
                  >
                    批量沽清(下架)
                  </PermissionButton>
                </FeedbackNotice>
              ) : null}
              {loadError ? (
                <ErrorState title="餐品加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void loadDishes(outletId)}>重试</button>} />
              ) : loading ? (
                <LoadingState title="正在加载餐品" />
              ) : (
                <DataTable className="allow-horizontal-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={allChecked} onChange={(e) => toggleSelectAll(e.target.checked)} aria-label="全选" /></th>
                      <th>编码</th>
                      <th>名称</th>
                      <th>品类</th>
                      <th>价格(元)</th>
                      <th>单位</th>
                      <th>日库存</th>
                      <th>已售</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dishes.map((dish) => (
                      <tr key={dish.id}>
                        <td><input type="checkbox" checked={selectedIds.has(dish.id)} onChange={(e) => toggleSelect(dish.id, e.target.checked)} aria-label={`选择 ${dish.name}`} /></td>
                        <td>{dish.dishNo}</td>
                        <td>{dish.name}</td>
                        <td>{(dish.categoryId && categoryNameById.get(dish.categoryId)) || "-"}</td>
                        <td>¥{dish.price}</td>
                        <td>{dish.unit}</td>
                        <td>{dish.dailyStock ?? "-"}</td>
                        <td>{dish.soldCount ?? 0}</td>
                        <td><DishStatus status={dish.status} /></td>
                        <td>
                          <DataTableActions>
                            <button className="table-action-button" type="button" onClick={() => setDetailDish(dish)}>详情</button>
                            <PermissionButton className="table-action-button" permission={CANTEEN_PERMISSIONS.DISH_UPDATE} type="button" onClick={() => openDishEdit(dish)}>编辑</PermissionButton>
                            <PermissionButton
                              className="table-action-button table-action-button--primary"
                              permission={CANTEEN_PERMISSIONS.DISH_SHELF}
                              type="button"
                              onClick={() => void toggleShelf(dish).catch((e: Error) => setMessage(e.message))}
                            >
                              {dish.status === "on_shelf" ? "下架" : "上架"}
                            </PermissionButton>
                          </DataTableActions>
                        </td>
                      </tr>
                    ))}
                    {dishes.length === 0 ? (
                      <tr>
                        <td colSpan={10}>
                          <EmptyState compact title="暂无餐品" description="点击右上角「新建餐品」添加。" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </DataTable>
              )}
            </ContentCard>
          </>
        ) : (
          <ContentCard
            title="品类管理"
            description="按 sort_order 升序展示在 POS 餐段页签下；off 状态不在终端显示。"
          >
            <DataTable>
              <thead>
                <tr>
                  <th>排序</th>
                  <th>品类名称</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.sortOrder}</td>
                    <td>{c.name}</td>
                    <td><StatusPill variant={c.status === "on" ? "success" : "muted"}>{c.status === "on" ? "启用" : "停用"}</StatusPill></td>
                    <td>
                      <DataTableActions>
                        <PermissionButton className="table-action-button" permission={CANTEEN_PERMISSIONS.CATEGORY_UPDATE} type="button" onClick={() => openCategoryEdit(c)}>编辑</PermissionButton>
                        <PermissionButton
                          className="table-action-button"
                          permission={CANTEEN_PERMISSIONS.CATEGORY_DELETE}
                          type="button"
                          onClick={() => void removeCategory(c).catch((e: Error) => setMessage(e.message))}
                        >
                          删除
                        </PermissionButton>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4}><EmptyState compact title="暂无品类" description="先建品类，再在餐品里归类上架。" /></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          </ContentCard>
        )}

        {detailDish ? (
          <Drawer size="md" onClose={() => setDetailDish(null)}>
            <DrawerHeader eyebrow="餐品详情" title={detailDish.name} description={`${detailDish.dishNo} · ¥${detailDish.price}/${detailDish.unit}`} onClose={() => setDetailDish(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="餐品编码" value={detailDish.dishNo} />
              <DrawerDetailItem label="状态" value={<DishStatus status={detailDish.status} />} />
              <DrawerDetailItem label="价格" value={`¥${detailDish.price}`} />
              <DrawerDetailItem label="单位" value={detailDish.unit} />
              <DrawerDetailItem label="条码" value={detailDish.barcode ?? "-"} />
              <DrawerDetailItem label="每日库存" value={detailDish.dailyStock ?? "-"} />
              <DrawerDetailItem label="累计已售" value={detailDish.soldCount ?? 0} />
              <DrawerDetailItem label="是否预订" value={detailDish.needBooking ? "是" : "否"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}

        {dishDrawer ? (
          <Drawer size="md" onClose={() => setDishDrawer(null)}>
            <DrawerHeader eyebrow="餐品" title={dishDrawer.mode === "create" ? "新建餐品" : "编辑餐品"} description="带 * 为必填；价格单位元，支持两位小数。" onClose={() => setDishDrawer(null)} />
            <DrawerForm onSubmit={(e: FormEvent<HTMLFormElement>) => void saveDish(e).catch((err: Error) => setMessage(err.message))}>
              <DrawerSection title="基本信息">
                <DrawerFormGrid>
                  <Field label="餐品名称 *">
                    <input required value={dishForm.name} onChange={(e) => setDishForm((c) => ({ ...c, name: e.target.value }))} />
                  </Field>
                  <Field label="所属品类 *">
                    <select required value={dishForm.category_id} onChange={(e) => setDishForm((c) => ({ ...c, category_id: e.target.value }))}>
                      <option value="">请选择品类</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="价格(元) *">
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={dishForm.price}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setDishForm((c) => ({ ...c, price: e.target.value }))}
                    />
                  </Field>
                </DrawerFormGrid>
              </DrawerSection>

              <DrawerSection title="更多选项">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                >
                  <ChevronDown size={16} />
                  单位 / 库存 / 条码 / 预订
                </button>
                {moreOpen ? (
                  <DrawerFormGrid>
                    <Field label="单位">
                      <input value={dishForm.unit} onChange={(e) => setDishForm((c) => ({ ...c, unit: e.target.value }))} />
                    </Field>
                    <Field label="每日库存">
                      <input
                        type="number"
                        min="0"
                        value={dishForm.daily_stock}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDishForm((c) => ({ ...c, daily_stock: e.target.value }))}
                        placeholder="留空表示不限量"
                      />
                    </Field>
                    <Field label="条码">
                      <input value={dishForm.barcode} onChange={(e) => setDishForm((c) => ({ ...c, barcode: e.target.value }))} />
                    </Field>
                    <Field label="需要预订">
                      <input type="checkbox" checked={dishForm.need_booking} onChange={(e) => setDishForm((c) => ({ ...c, need_booking: e.target.checked }))} />
                    </Field>
                  </DrawerFormGrid>
                ) : null}
              </DrawerSection>

              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setDishDrawer(null)}>取消</button>
                <button className="primary-button" type="submit"><Save size={16} />保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {categoryDrawer ? (
          <Drawer size="md" onClose={() => setCategoryDrawer(null)}>
            <DrawerHeader eyebrow="品类" title={categoryDrawer.mode === "create" ? "新建品类" : "编辑品类"} description="品类在 POS 终端以页签展示。" onClose={() => setCategoryDrawer(null)} />
            <DrawerForm onSubmit={(e: FormEvent<HTMLFormElement>) => void saveCategory(e).catch((err: Error) => setMessage(err.message))}>
              <DrawerFormGrid>
                <Field label="品类名称 *">
                  <input required value={categoryForm.name} onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))} />
                </Field>
                <Field label="排序">
                  <input type="number" value={categoryForm.sort_order} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setCategoryForm((c) => ({ ...c, sort_order: e.target.value }))} />
                </Field>
                <Field label="状态">
                  <select value={categoryForm.status} onChange={(e) => setCategoryForm((c) => ({ ...c, status: e.target.value as "on" | "off" }))}>
                    <option value="on">启用</option>
                    <option value="off">停用</option>
                  </select>
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setCategoryDrawer(null)}>取消</button>
                <button className="primary-button" type="submit"><Save size={16} />保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function DishStatus({ status }: { status: string }) {
  if (status === "on_shelf") return <StatusPill variant="success">已上架</StatusPill>;
  return <StatusPill variant="muted">已下架</StatusPill>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
