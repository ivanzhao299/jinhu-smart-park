# Payroll business ledger presentation

Use payroll calculation and payroll ledger as business work areas. Ordinary wage cards show the month, account book, permitted employee identity, amounts and detail action. Do not expose source table names or technical mapping state there. The existing history query returns mapped rows; source audit and exception review remain separate server concerns.

For management reads, derive employee visibility only from the response publicationStatus: published means employee-visible; all other states mean not employee-visible. This is visibility, not wage approval, recalculation or payment status. Self-only cards omit employee identity and management visibility labels. Preserve existing page/data/self permissions, published-only server access, pagination, filters, detail generation/abort and clearing behavior.

This presentation change does not unify underlying stores or supply historical financial corrections. Those workflows require separate implementation and acceptance. No data writes or publication occur on entering the ledger.

Reuse DS panels and mobile records. Paginated controls wrap as a group while button/page text stays horizontal; touch controls have a minimum 44px height. Inspect actual HrPayrollClient at desktop and CSS390px with representative page counts, detail, next page and month query. Record synthetic transport separately from actual production-role/data acceptance.
