import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const key = () => randomUUID(), today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const login = async (base, i) => { const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: i.username, password: i.password }) }); assert.equal(r.status, 200, 'provisioner login'); return (await r.json()).data; };
const request = async (base, s, m, p, b, e = m === 'POST' ? 201 : 200) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.accessToken, 'x-idempotency-key': key() }, ...(b === undefined ? {} : { body: JSON.stringify(b) }) }); const x = await r.json(); assert.equal(r.status, e, `${m} ${p}: ${r.status} ${String(x.message)}`); return x.data ?? x; };
const pages = ['hr:employees', 'hr:approvals', 'hr:lifecycle'];
const specs = {
    employee: [...pages, 'hr:approval:self_manage', 'hr:employee:self_read', 'hr:employee_profile:self_read', 'hr:job_change:self_read'],
    manager: [...pages, 'hr:approval:team_review', 'hr:employee:team_read', 'hr:employee_profile:team_read', 'hr:job_change:team_read'],
    hr: [...pages, 'hr:approval:park_review', 'hr:employee:read', 'hr:employment_event:read', 'hr:employee_profile:read', 'hr:employee_profile:manage', 'hr:job_change:read', 'hr:job_change:manage'],
    reviewer: ['hr:lifecycle', 'hr:job_change:read', 'hr:job_change:review', 'hr:job_change:apply']
};
export async function prepareApprovedPersonnel(configPath) {
    const config = JSON.parse(readFileSync(configPath));
    config.approvedPersonnel ??= {};
    for (const mode of ['enterprise', 'integrated']) {
        const c = config[mode], base = c.apiBase, admin = await login(base, c), tag = 'APC' + randomUUID().slice(0, 8), roles = {}, actors = {};
        if (mode === 'enterprise') {
            for (const [name, permissionCodes] of Object.entries(specs))
                roles[name] = await request(base, admin, 'POST', '/enterprise/roles', { code: `${tag}_${name}`, name: `Synthetic approved ${name}`, dataScope: name === 'manager' ? 'org' : 'park', permissionCodes, reason: 'Synthetic approved personnel continuity' });
        }
        else {
            const permissions = [];
            for (let page = 1; ; page++) {
                const result = await request(base, admin, 'GET', `/permissions?page=${page}&page_size=100`);
                permissions.push(...result.items);
                assert.ok(page <= 100, 'Permission catalog exceeds fixture bound');
                if (permissions.length >= result.total) break;
                assert.ok(result.items.length, 'Incomplete permission catalog');
            }
            for (const [name, codes] of Object.entries(specs)) {
                // The integrated production seed exposes the HR workspace below this
                // menu root. It is presentation-only and does not broaden the role's
                // HR API permissions; enterprise roles use their existing page codes.
                const permissionCodes = [...codes, 'hr'];
                const role = await request(base, admin, 'POST', '/roles', { code: `${tag}_${name}`, name: `Synthetic approved ${name}`, roleScope: 'park', dataScope: name === 'manager' ? 'org_and_children' : 'park' });
                const selected = permissions.filter(p => permissionCodes.includes(p.code));
                assert.deepEqual(selected.map(p => p.code).sort(), permissionCodes.sort(), 'All exact narrow permissions must exist');
                await request(base, admin, 'POST', `/roles/${role.id}/permissions`, { permissionIds: selected.map(p => p.id) });
                roles[name] = role;
            }
        }
        for (const name of Object.keys(specs)) {
            const identity = { username: `apc_${name}_${tag}`.toLowerCase(), password: `Synthetic-only-${randomUUID()}`, displayName: `Synthetic ${name}` };
            actors[name] = mode === 'enterprise' ? { ...identity, ...await request(base, admin, 'POST', '/enterprise/members', { ...identity, roleIds: [roles[name].id], reason: 'Synthetic approved personnel continuity' }) } : { ...identity, ...await request(base, admin, 'POST', '/users', identity) };
            if (mode !== 'enterprise')
                await request(base, admin, 'POST', `/users/${actors[name].id}/roles`, { roleIds: [roles[name].id] });
        }
        const department = await request(base, admin, 'POST', '/orgs', { orgCode: `${tag}D`, orgName: 'Synthetic approved department', orgType: 'department', leaderUserId: actors.manager.id }), target = await request(base, admin, 'POST', '/orgs', { orgCode: `${tag}T`, orgName: 'Synthetic approved target', orgType: 'department' }), outside = await request(base, admin, 'POST', '/orgs', { orgCode: `${tag}O`, orgName: 'Synthetic approved outside', orgType: 'department' });
        const createEmployee = async (identity, org, suffix) => {
            const employee = await request(base, admin, 'POST', '/hr/employees', { employeeCode: `${tag}${suffix}`, fullName: `Synthetic ${suffix}`, userId: identity?.id, primaryOrgId: org.id, employmentType: 'full_time', hireDate: today });
            // New employees start preboarding regardless of requested status.
            return request(base, admin, 'POST', `/hr/employees/${employee.id}/transitions`, { action: 'confirm_employment', effectiveDate: today, reason: 'Owned fixture initial employment confirmation' });
        };
        const managerEmployee = await createEmployee(actors.manager, department, 'M'), employee = await createEmployee(actors.employee, department, 'E'), foreign = await createEmployee(null, outside, 'F');
        await request(base, admin, 'PUT', `/hr/employees/${employee.id}/profile`, { expectedVersion: 0, englishName: 'Synthetic preserved', nativePlace: 'Synthetic original', highestEducation: 'Synthetic education' });
        config.approvedPersonnel[mode] = { employee: { username: actors.employee.username, password: actors.employee.password, id: actors.employee.id }, manager: { username: actors.manager.username, password: actors.manager.password, id: actors.manager.id }, hr: { username: actors.hr.username, password: actors.hr.password, id: actors.hr.id }, reviewer: { username: actors.reviewer.username, password: actors.reviewer.password, id: actors.reviewer.id }, targetOrgId: target.id, departmentId: department.id, foreignEmployeeId: foreign.id, today, employeeId: employee.id, managerEmployeeId: managerEmployee.id };
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    return config;
}
