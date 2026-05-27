import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Briefcase,
	Building,
	Check,
	Settings,
	User,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/employees/create")({
	component: EmployeeCreatePage,
});

interface FormData {
	accountNumber: string;
	address: string;
	badgeId: string;
	bankCode1: string;
	bankName: string;
	basicSalary: string;
	branch: string;
	city: string;
	country: string;
	dateOfBirth: string;
	departmentId: string;
	email: string;
	employeeTypeId: string;
	firstName: string;
	gender: string;
	jobPositionId: string;
	jobRoleId: string;
	joiningDate: string;
	lastName: string;
	phone: string;
	reportingManagerId: string;
	salaryCurrency: string;
	shiftId: string;
	workEmail: string;
	workLocation: string;
	workPhone: string;
	workTypeId: string;
}

const EMPTY_FORM: FormData = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	badgeId: "",
	dateOfBirth: "",
	gender: "",
	address: "",
	city: "",
	country: "",
	departmentId: "",
	jobPositionId: "",
	jobRoleId: "",
	reportingManagerId: "",
	workTypeId: "",
	employeeTypeId: "",
	shiftId: "",
	joiningDate: "",
	workLocation: "",
	workEmail: "",
	workPhone: "",
	basicSalary: "",
	salaryCurrency: "GYD",
	bankName: "",
	accountNumber: "",
	branch: "",
	bankCode1: "",
};

const STEPS = [
	{ key: "basic", label: "Basic Info", icon: <User size={14} /> },
	{ key: "work", label: "Work Details", icon: <Briefcase size={14} /> },
	{ key: "pay", label: "Pay & Banking", icon: <Wallet size={14} /> },
	{ key: "review", label: "Review", icon: <Check size={14} /> },
];

function EmployeeCreatePage() {
	const navigate = useNavigate();
	const [step, setStep] = useState(0);
	const [form, setForm] = useState<FormData>(EMPTY_FORM);
	const [creating, setCreating] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const { data: depts } = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: positions } = useQuery(
		orpc.hrCore.jobPositions.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: roles } = useQuery(
		orpc.hrCore.jobRoles.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: workTypes } = useQuery(
		orpc.hrCore.workTypes.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: empTypes } = useQuery(
		orpc.hrCore.employeeTypes.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: shifts } = useQuery(
		orpc.hrCore.shifts.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const { data: empListData } = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 200 },
		})
	);

	const departments = (depts ?? []) as { id: string; name: string }[];
	const allPositions = (positions ?? []) as {
		id: string;
		name: string;
		departmentId: string;
	}[];
	const allRoles = (roles ?? []) as {
		id: string;
		name: string;
		jobPositionId: string;
	}[];
	const workTypeList = (workTypes ?? []) as { id: string; name: string }[];
	const empTypeList = (empTypes ?? []) as { id: string; name: string }[];
	const shiftList = (shifts ?? []) as { id: string; name: string }[];
	const managers =
		(
			empListData as {
				data: { id: string; firstName: string; lastName: string | null }[];
			}
		)?.data ?? [];

	const filteredPositions = form.departmentId
		? allPositions.filter((p) => p.departmentId === form.departmentId)
		: allPositions;
	const filteredRoles = form.jobPositionId
		? allRoles.filter((r) => r.jobPositionId === form.jobPositionId)
		: allRoles;

	const set = (key: keyof FormData, value: string) => {
		setForm((f) => {
			const next = { ...f, [key]: value };
			if (key === "departmentId") {
				next.jobPositionId = "";
				next.jobRoleId = "";
			}
			if (key === "jobPositionId") {
				next.jobRoleId = "";
			}
			return next;
		});
		setErrors((e) => {
			const next = { ...e };
			delete next[key];
			return next;
		});
	};

	const validateStep = (): boolean => {
		const errs: Record<string, string> = {};
		if (step === 0) {
			if (!form.firstName.trim()) {
				errs.firstName = "First name is required";
			}
			if (!form.email.trim()) {
				errs.email = "Email is required";
			} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
				errs.email = "Enter a valid email address";
			}
		}
		setErrors(errs);
		return Object.keys(errs).length === 0;
	};

	const goNext = () => {
		if (validateStep()) {
			setStep((s) => Math.min(s + 1, STEPS.length - 1));
		}
	};
	const goBack = () => setStep((s) => Math.max(s - 1, 0));

	const handleCreate = async () => {
		setCreating(true);
		try {
			const emp = await client.hrCore.employees.create({
				firstName: form.firstName.trim(),
				lastName: form.lastName.trim() || undefined,
				email: form.email.trim(),
				phone: form.phone.trim() || undefined,
				badgeId: form.badgeId.trim() || undefined,
				dateOfBirth: form.dateOfBirth || undefined,
				gender: (form.gender as "male" | "female" | "other") || undefined,
				address: form.address.trim() || undefined,
				city: form.city.trim() || undefined,
				country: form.country.trim() || undefined,
				departmentId: form.departmentId || undefined,
				jobPositionId: form.jobPositionId || undefined,
				jobRoleId: form.jobRoleId || undefined,
				reportingManagerId: form.reportingManagerId || undefined,
				workTypeId: form.workTypeId || undefined,
				employeeTypeId: form.employeeTypeId || undefined,
				shiftId: form.shiftId || undefined,
				joiningDate: form.joiningDate || undefined,
				workLocation: form.workLocation.trim() || undefined,
				workEmail: form.workEmail.trim() || undefined,
				basicSalary: form.basicSalary || undefined,
				salaryCurrency: form.salaryCurrency || undefined,
			});

			if (form.bankName.trim() && form.accountNumber.trim() && emp.id) {
				await client.hrCore.employees.bankDetails.update({
					employeeId: emp.id,
					bankName: form.bankName.trim(),
					accountNumber: form.accountNumber.trim(),
					branch: form.branch.trim() || undefined,
					bankCode1: form.bankCode1.trim() || undefined,
				});
			}

			toast.success(`${form.firstName} ${form.lastName} created successfully`);
			navigate({ to: "/app/employees/$id", params: { id: emp.id } });
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Could not create employee";
			if (msg.includes("unique") || msg.includes("duplicate")) {
				toast.error("An employee with this email or badge ID already exists.");
			} else {
				toast.error(msg);
			}
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="page" style={{ maxWidth: 720 }}>
			<div className="crumbs">
				<span>
					<Link style={{ color: "var(--fg-3)" }} to="/app/employees">
						Employees
					</Link>
				</span>
				<span className="sep">/</span>
				<span>New Employee</span>
			</div>

			<h1 className="page-title" style={{ marginBottom: 8, fontSize: "22px" }}>
				Add New Employee
			</h1>
			<p
				style={{
					fontSize: "13px",
					color: "var(--fg-3)",
					marginBottom: 24,
				}}
			>
				Fill in the basics to create an employee record. You can add more
				details later.
			</p>

			{/* Step indicator */}
			<div
				style={{
					display: "flex",
					gap: 4,
					marginBottom: 28,
				}}
			>
				{STEPS.map((s, i) => (
					<button
						key={s.key}
						onClick={() => {
							if (i < step) {
								setStep(i);
							}
						}}
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 6,
							padding: "10px 0",
							fontSize: "12.5px",
							fontWeight: i === step ? 600 : 400,
							color:
								i < step
									? "var(--success)"
									: i === step
										? "var(--accent)"
										: "var(--fg-4)",
							background: i === step ? "var(--accent-soft)" : "var(--bg-3)",
							border: "1px solid",
							borderColor: i === step ? "var(--accent)" : "var(--line)",
							borderRadius:
								i === 0
									? "10px 0 0 10px"
									: i === STEPS.length - 1
										? "0 10px 10px 0"
										: 0,
							cursor: i < step ? "pointer" : "default",
							fontFamily: "inherit",
						}}
						type="button"
					>
						{i < step ? <Check size={13} /> : s.icon}
						{s.label}
					</button>
				))}
			</div>

			{/* Step content */}
			<div className="card card-pad" style={{ marginBottom: 20 }}>
				{step === 0 && <StepBasicInfo errors={errors} form={form} set={set} />}
				{step === 1 && (
					<StepWorkInfo
						departments={departments}
						empTypeList={empTypeList}
						filteredPositions={filteredPositions}
						filteredRoles={filteredRoles}
						form={form}
						managers={managers}
						set={set}
						shiftList={shiftList}
						workTypeList={workTypeList}
					/>
				)}
				{step === 2 && <StepPayBanking form={form} set={set} />}
				{step === 3 && (
					<StepReview
						departments={departments}
						empTypeList={empTypeList}
						form={form}
						managers={managers}
						positions={allPositions}
						roles={allRoles}
						shiftList={shiftList}
						workTypeList={workTypeList}
					/>
				)}
			</div>

			{/* Navigation */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div>
					{step > 0 && (
						<button className="btn btn-ghost" onClick={goBack} type="button">
							<ArrowLeft size={13} />
							Back
						</button>
					)}
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<Link className="btn btn-outline" to="/app/employees">
						Cancel
					</Link>
					{step < STEPS.length - 1 ? (
						<button className="btn btn-primary" onClick={goNext} type="button">
							Continue
							<ArrowRight size={13} />
						</button>
					) : (
						<button
							className="btn btn-primary"
							disabled={creating}
							onClick={handleCreate}
							type="button"
						>
							{creating ? "Creating…" : "Create Employee"}
							<Check size={13} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Step Components ──────────────────────────────────────

function Field({
	label,
	required,
	error,
	help,
	children,
}: {
	label: string;
	required?: boolean;
	error?: string;
	help?: string;
	children: React.ReactNode;
}) {
	return (
		<div style={{ marginBottom: 16 }}>
			<label className="label" style={{ marginBottom: 4 }}>
				{label}
				{required && (
					<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>
				)}
			</label>
			{children}
			{error && (
				<p
					style={{
						fontSize: "12px",
						color: "var(--danger)",
						marginTop: 4,
					}}
				>
					{error}
				</p>
			)}
			{help && !error && (
				<p
					style={{
						fontSize: "11.5px",
						color: "var(--fg-4)",
						marginTop: 4,
					}}
				>
					{help}
				</p>
			)}
		</div>
	);
}

function Row({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
			{children}
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="tiny" style={{ marginBottom: 16, marginTop: 4 }}>
			{children}
		</div>
	);
}

function StepBasicInfo({
	form,
	set,
	errors,
}: {
	form: FormData;
	set: (k: keyof FormData, v: string) => void;
	errors: Record<string, string>;
}) {
	return (
		<>
			<SectionLabel>Personal information</SectionLabel>
			<Row>
				<Field error={errors.firstName} label="First name" required>
					<input
						autoFocus
						className="input"
						onChange={(e) => set("firstName", e.target.value)}
						placeholder="e.g., Maya"
						value={form.firstName}
					/>
				</Field>
				<Field label="Last name">
					<input
						className="input"
						onChange={(e) => set("lastName", e.target.value)}
						placeholder="e.g., Persaud"
						value={form.lastName}
					/>
				</Field>
			</Row>
			<Row>
				<Field error={errors.email} label="Email" required>
					<input
						className="input"
						onChange={(e) => set("email", e.target.value)}
						placeholder="e.g., maya@atlas-shipping.com"
						type="email"
						value={form.email}
					/>
				</Field>
				<Field label="Phone">
					<input
						className="input"
						onChange={(e) => set("phone", e.target.value)}
						placeholder="+592-600-1001"
						value={form.phone}
					/>
				</Field>
			</Row>
			<Row>
				<Field help="Leave blank to auto-generate later" label="Badge ID">
					<input
						className="input"
						onChange={(e) => set("badgeId", e.target.value)}
						placeholder="e.g., EMP-00128"
						value={form.badgeId}
					/>
				</Field>
				<Field label="Date of birth">
					<input
						className="input"
						onChange={(e) => set("dateOfBirth", e.target.value)}
						type="date"
						value={form.dateOfBirth}
					/>
				</Field>
			</Row>
			<Row>
				<Field label="Gender">
					<select
						className="input"
						onChange={(e) => set("gender", e.target.value)}
						value={form.gender}
					>
						<option value="">Not specified</option>
						<option value="male">Male</option>
						<option value="female">Female</option>
						<option value="other">Other</option>
					</select>
				</Field>
				<Field label="Country">
					<input
						className="input"
						onChange={(e) => set("country", e.target.value)}
						placeholder="e.g., GY"
						value={form.country}
					/>
				</Field>
			</Row>
			<Row>
				<Field label="City">
					<input
						className="input"
						onChange={(e) => set("city", e.target.value)}
						placeholder="e.g., Georgetown"
						value={form.city}
					/>
				</Field>
				<Field label="Address">
					<input
						className="input"
						onChange={(e) => set("address", e.target.value)}
						placeholder="Street address"
						value={form.address}
					/>
				</Field>
			</Row>
		</>
	);
}

function StepWorkInfo({
	form,
	set,
	departments,
	filteredPositions,
	filteredRoles,
	workTypeList,
	empTypeList,
	shiftList,
	managers,
}: {
	form: FormData;
	set: (k: keyof FormData, v: string) => void;
	departments: { id: string; name: string }[];
	filteredPositions: { id: string; name: string }[];
	filteredRoles: { id: string; name: string }[];
	workTypeList: { id: string; name: string }[];
	empTypeList: { id: string; name: string }[];
	shiftList: { id: string; name: string }[];
	managers: { id: string; firstName: string; lastName: string | null }[];
}) {
	const noSetup = departments.length === 0;

	if (noSetup) {
		return (
			<div style={{ textAlign: "center", padding: "24px 0" }}>
				<Settings size={24} style={{ color: "var(--fg-3)", marginBottom: 8 }} />
				<h4
					style={{
						fontSize: "14px",
						fontWeight: 600,
						marginBottom: 4,
					}}
				>
					Set up your organization first
				</h4>
				<p
					style={{
						fontSize: "13px",
						color: "var(--fg-3)",
						marginBottom: 16,
					}}
				>
					Create departments, positions, and shifts before adding employees.
				</p>
				<Link className="btn btn-primary btn-sm" to="/app/settings">
					Go to Settings
				</Link>
			</div>
		);
	}

	return (
		<>
			<SectionLabel>Work information — all fields optional</SectionLabel>
			<Row>
				<Field label="Department">
					<select
						className="input"
						onChange={(e) => set("departmentId", e.target.value)}
						value={form.departmentId}
					>
						<option value="">Select department…</option>
						{departments.map((d) => (
							<option key={d.id} value={d.id}>
								{d.name}
							</option>
						))}
					</select>
				</Field>
				<Field
					help={
						form.departmentId
							? undefined
							: "Select a department first to filter positions"
					}
					label="Position"
				>
					<select
						className="input"
						onChange={(e) => set("jobPositionId", e.target.value)}
						value={form.jobPositionId}
					>
						<option value="">Select position…</option>
						{filteredPositions.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</Field>
			</Row>
			{filteredRoles.length > 0 && (
				<Row>
					<Field
						help="Optional specialization within the position"
						label="Specialization"
					>
						<select
							className="input"
							onChange={(e) => set("jobRoleId", e.target.value)}
							value={form.jobRoleId}
						>
							<option value="">None</option>
							{filteredRoles.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
						</select>
					</Field>
					<div />
				</Row>
			)}
			<Row>
				<Field help="This employee's direct manager" label="Reports To">
					<select
						className="input"
						onChange={(e) => set("reportingManagerId", e.target.value)}
						value={form.reportingManagerId}
					>
						<option value="">No manager</option>
						{managers.map((m) => (
							<option key={m.id} value={m.id}>
								{m.firstName} {m.lastName ?? ""}
							</option>
						))}
					</select>
				</Field>
				<Field label="Shift">
					<select
						className="input"
						onChange={(e) => set("shiftId", e.target.value)}
						value={form.shiftId}
					>
						<option value="">Select shift…</option>
						{shiftList.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</Field>
			</Row>
			<Row>
				<Field label="Work Arrangement">
					<select
						className="input"
						onChange={(e) => set("workTypeId", e.target.value)}
						value={form.workTypeId}
					>
						<option value="">Select…</option>
						{workTypeList.map((w) => (
							<option key={w.id} value={w.id}>
								{w.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Employment Type">
					<select
						className="input"
						onChange={(e) => set("employeeTypeId", e.target.value)}
						value={form.employeeTypeId}
					>
						<option value="">Select…</option>
						{empTypeList.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</Field>
			</Row>
			<Row>
				<Field label="Joining Date">
					<input
						className="input"
						onChange={(e) => set("joiningDate", e.target.value)}
						type="date"
						value={form.joiningDate}
					/>
				</Field>
				<Field label="Work Location">
					<input
						className="input"
						onChange={(e) => set("workLocation", e.target.value)}
						placeholder="e.g., Georgetown"
						value={form.workLocation}
					/>
				</Field>
			</Row>
		</>
	);
}

function StepPayBanking({
	form,
	set,
}: {
	form: FormData;
	set: (k: keyof FormData, v: string) => void;
}) {
	return (
		<>
			<SectionLabel>Compensation — all fields optional</SectionLabel>
			<Row>
				<Field label="Base Salary">
					<input
						className="input"
						onChange={(e) => set("basicSalary", e.target.value)}
						placeholder="e.g., 350000"
						type="number"
						value={form.basicSalary}
					/>
				</Field>
				<Field label="Currency">
					<select
						className="input"
						onChange={(e) => set("salaryCurrency", e.target.value)}
						value={form.salaryCurrency}
					>
						<option value="GYD">GYD — Guyanese Dollar</option>
						<option value="TTD">TTD — Trinidad Dollar</option>
						<option value="JMD">JMD — Jamaican Dollar</option>
						<option value="BBD">BBD — Barbados Dollar</option>
						<option value="USD">USD — US Dollar</option>
					</select>
				</Field>
			</Row>

			<SectionLabel>Bank details — optional, sensitive</SectionLabel>
			<p
				style={{
					fontSize: "12px",
					color: "var(--fg-3)",
					marginBottom: 16,
					marginTop: -8,
				}}
			>
				Bank details are visible only to authorized HR and payroll staff. Other
				employees cannot see this information.
			</p>
			<Row>
				<Field label="Bank Name">
					<input
						className="input"
						onChange={(e) => set("bankName", e.target.value)}
						placeholder="e.g., Demerara Bank"
						value={form.bankName}
					/>
				</Field>
				<Field label="Account Number">
					<input
						className="input"
						onChange={(e) => set("accountNumber", e.target.value)}
						placeholder="Account number"
						value={form.accountNumber}
					/>
				</Field>
			</Row>
			<Row>
				<Field label="Branch">
					<input
						className="input"
						onChange={(e) => set("branch", e.target.value)}
						placeholder="e.g., Main Branch"
						value={form.branch}
					/>
				</Field>
				<Field help="Routing code, SWIFT, or sort code" label="Bank Code">
					<input
						className="input"
						onChange={(e) => set("bankCode1", e.target.value)}
						placeholder="e.g., DMBKGYGG"
						value={form.bankCode1}
					/>
				</Field>
			</Row>
		</>
	);
}

function StepReview({
	form,
	departments,
	positions,
	roles,
	workTypeList,
	empTypeList,
	shiftList,
	managers,
}: {
	form: FormData;
	departments: { id: string; name: string }[];
	positions: { id: string; name: string }[];
	roles: { id: string; name: string }[];
	workTypeList: { id: string; name: string }[];
	empTypeList: { id: string; name: string }[];
	shiftList: { id: string; name: string }[];
	managers: { id: string; firstName: string; lastName: string | null }[];
}) {
	const resolve = (list: { id: string; name: string }[], id: string) =>
		list.find((x) => x.id === id)?.name ?? "";
	const resolveMgr = (id: string) => {
		const m = managers.find((x) => x.id === id);
		return m ? `${m.firstName} ${m.lastName ?? ""}` : "";
	};

	const sections = [
		{
			title: "Basic Information",
			rows: [
				{ k: "Name", v: `${form.firstName} ${form.lastName}`.trim() },
				{ k: "Email", v: form.email },
				{ k: "Phone", v: form.phone },
				{ k: "Badge ID", v: form.badgeId || "Auto-generate later" },
				{ k: "Date of Birth", v: form.dateOfBirth },
				{
					k: "Gender",
					v: form.gender
						? form.gender.charAt(0).toUpperCase() + form.gender.slice(1)
						: "",
				},
				{ k: "Country", v: form.country },
				{ k: "City", v: form.city },
			],
		},
		{
			title: "Work Details",
			rows: [
				{ k: "Department", v: resolve(departments, form.departmentId) },
				{ k: "Position", v: resolve(positions, form.jobPositionId) },
				{ k: "Specialization", v: resolve(roles, form.jobRoleId) },
				{ k: "Reports To", v: resolveMgr(form.reportingManagerId) },
				{ k: "Shift", v: resolve(shiftList, form.shiftId) },
				{ k: "Work Arrangement", v: resolve(workTypeList, form.workTypeId) },
				{ k: "Employment Type", v: resolve(empTypeList, form.employeeTypeId) },
				{ k: "Joining Date", v: form.joiningDate },
				{ k: "Location", v: form.workLocation },
			],
		},
		{
			title: "Pay & Banking",
			rows: [
				{
					k: "Base Salary",
					v: form.basicSalary
						? `${Number(form.basicSalary).toLocaleString()} ${form.salaryCurrency}`
						: "",
				},
				{ k: "Bank", v: form.bankName },
				{
					k: "Account",
					v: form.accountNumber ? `****${form.accountNumber.slice(-4)}` : "",
				},
				{ k: "Branch", v: form.branch },
			],
		},
	];

	return (
		<>
			<SectionLabel>Review before creating</SectionLabel>
			{sections.map((section) => (
				<div key={section.title} style={{ marginBottom: 20 }}>
					<div className="tiny" style={{ marginBottom: 8 }}>
						{section.title}
					</div>
					{section.rows
						.filter((r) => r.v)
						.map((r) => (
							<div className="kv" key={r.k} style={{ padding: "6px 0" }}>
								<span className="kv-k" style={{ fontSize: "12.5px" }}>
									{r.k}
								</span>
								<span className="kv-v" style={{ fontSize: "12.5px" }}>
									{r.v}
								</span>
							</div>
						))}
					{section.rows.filter((r) => r.v).length === 0 && (
						<p
							style={{
								fontSize: "12px",
								color: "var(--fg-4)",
								fontStyle: "italic",
							}}
						>
							No {section.title.toLowerCase()} provided — you can add these
							later.
						</p>
					)}
				</div>
			))}
		</>
	);
}
