// Admin pages.
(function () {
    // Shared table logic.
    const listMixin = {
        data() { return { rows: [], page: 1, pages: 1, total: 0, q: "", status: "", loading: true, error: "" }; },
        created() { this.load(); },
        methods: {
            params() {
                const p = new URLSearchParams({ page: this.page });
                if (this.q) p.set("q", this.q);
                if (this.status) p.set("status", this.status);
                const extra = this.extraParams ? this.extraParams() : {};
                Object.entries(extra).forEach(([k, v]) => { if (v !== "" && v != null) p.set(k, v); });
                return p.toString();
            },
            async load() {
                this.loading = true;
                this.error = "";
                try {
                    const res = await window.api.get(`${this.endpoint}?${this.params()}`);
                    Object.assign(this, { rows: res.data.items, page: res.data.page, pages: res.data.pages, total: res.data.total });
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.loading = false;
                }
            },
            search() { this.page = 1; this.load(); },
            goTo(n) { this.page = n; this.load(); },
        },
    };

    // Search and status filters.
    const ListFilters = {
        props: { q: String, status: String, statuses: Array, placeholder: String },
        emits: ["update:q", "update:status", "search"],
        template: `
            <form class="d-flex flex-wrap gap-2 mb-3" role="search" @submit.prevent="$emit('search')">
                <input :value="q" @input="$emit('update:q', $event.target.value)" @search="$emit('search')"
                       class="form-control" style="max-width: 22rem" type="search" :placeholder="placeholder" aria-label="Search">
                <select :value="status" @change="$emit('update:status', $event.target.value); $emit('search')"
                        class="form-select" style="max-width: 12rem" aria-label="Filter by status">
                    <option value="">All statuses</option>
                    <option v-for="s in statuses" :key="s">{{ s }}</option>
                </select>
            </form>`,
    };

    // Overview.
    const AdminDashboard = {
        data() { return { stats: null, error: "" }; },
        async created() {
            try { this.stats = (await window.api.get("/api/admin/stats")).data; }
            catch (e) { this.error = e.message; }
        },
        computed: {
            figures() {
                const s = this.stats;
                return [
                    { label: "Treks", value: s.total_treks, to: "/admin/treks" },
                    { label: "Trekkers", value: s.total_users, to: "/admin/users" },
                    { label: "Trek staff", value: s.total_staff, to: "/admin/staff" },
                    { label: "Bookings", value: s.total_bookings, to: "/admin/bookings" },
                ];
            },
            nothingToDo() { const a = this.stats.attention; return !a.pending.length && !a.unassigned.length; },
        },
        template: `
            <div>
                <page-header title="Overview">
                    <router-link class="btn btn-primary" :to="{ path: '/admin/treks', query: { new: 1 } }">Add trek</router-link>
                </page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!stats"></loading-block>
                <template v-else>
                    <figure-row :items="figures" class="mb-4"></figure-row>
                    <div class="row g-4">
                        <div class="col-lg-8">
                            <div class="card h-100">
                                <div class="card-header d-flex justify-content-between align-items-baseline">
                                    <h2 class="h6 mb-0">Latest bookings</h2>
                                    <router-link to="/admin/bookings" class="small">All bookings</router-link>
                                </div>
                                <div class="table-responsive">
                                    <table class="table align-middle">
                                        <thead><tr><th>Trekker</th><th>Trek</th><th>Booked</th><th>Status</th></tr></thead>
                                        <tbody>
                                            <tr v-for="b in stats.recent_bookings" :key="b.id">
                                                <td>{{ b.user.name }}</td>
                                                <td>{{ b.trek.name }}</td>
                                                <td class="mono text-body-secondary">{{ $fmt.dateTime(b.booking_date) }}</td>
                                                <td><status-badge :status="b.status" kind="booking"></status-badge></td>
                                            </tr>
                                            <tr v-if="!stats.recent_bookings.length"><td colspan="4" class="text-body-secondary">No bookings yet</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-4">
                            <div class="card h-100">
                                <div class="card-header"><h2 class="h6 mb-0">Needs you</h2></div>
                                <div class="card-body pt-2">
                                    <p v-if="nothingToDo" class="text-body-secondary small mb-0">Every upcoming trek is approved and has a leader.</p>
                                    <template v-if="stats.attention.pending.length">
                                        <div class="small text-body-secondary mt-2">Waiting for approval</div>
                                        <ul class="list-unstyled attention mb-3">
                                            <li v-for="t in stats.attention.pending" :key="t.id">
                                                <router-link :to="{ path: '/admin/treks', query: { edit: t.id } }">{{ t.name }}</router-link>
                                                <span class="mono text-body-secondary">{{ $fmt.short(t.start_date) }}</span>
                                            </li>
                                        </ul>
                                    </template>
                                    <template v-if="stats.attention.unassigned.length">
                                        <div class="small text-body-secondary">No trek leader</div>
                                        <ul class="list-unstyled attention mb-0">
                                            <li v-for="t in stats.attention.unassigned" :key="t.id">
                                                <router-link :to="{ path: '/admin/treks', query: { edit: t.id } }">{{ t.name }}</router-link>
                                                <span class="mono text-body-secondary">{{ $fmt.short(t.start_date) }}</span>
                                            </li>
                                        </ul>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>`,
    };

    // Treks.
    const emptyTrek = () => ({
        name: "", location: "", difficulty: "Moderate", start_date: "", end_date: "",
        total_slots: 20, price: 0, status: "Pending", assigned_staff_id: "", image_url: "", description: "",
    });

    const TrekFormModal = {
        props: { trek: Object, staffOptions: Array },
        emits: ["close", "saved"],
        data() {
            const t = this.trek;
            return {
                form: t ? {
                    name: t.name, location: t.location, difficulty: t.difficulty, start_date: t.start_date,
                    end_date: t.end_date, total_slots: t.total_slots, price: t.price, status: t.status,
                    assigned_staff_id: t.assigned_staff_id || "",
                    image_url: t.image_url && !t.image_url.includes("trek-placeholder") ? t.image_url : "",
                    description: t.description || "",
                } : emptyTrek(),
                error: "",
                busy: false,
                today: new Date().toISOString().slice(0, 10),
            };
        },
        computed: {
            editing() { return !!this.trek; },
            started() { return this.trek && this.trek.started_at; },
            duration() {
                if (!this.form.start_date || !this.form.end_date) return null;
                const days = Math.round((new Date(this.form.end_date) - new Date(this.form.start_date)) / 86400000) + 1;
                return days > 0 ? days : null;
            },
            minSlots() { return this.trek ? Math.max(1, this.trek.booked_count) : 1; },
            statusOptions() { return this.started ? ["Open", "Closed"] : ["Pending", "Approved", "Open", "Closed"]; },
        },
        methods: {
            async submit() {
                const formEl = this.$refs.form;
                const end = formEl.querySelector("#tf-end");
                end.setCustomValidity(this.form.end_date && this.form.start_date && this.form.end_date < this.form.start_date ? "End date must be on or after the start date" : "");
                if (!formEl.checkValidity()) {
                    formEl.classList.add("was-validated");
                    return;
                }
                this.busy = true;
                this.error = "";
                try {
                    const res = this.editing
                        ? await window.api.put(`/api/admin/treks/${this.trek.id}`, this.form)
                        : await window.api.post("/api/admin/treks", this.form);
                    this.$emit("saved", res.message);
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.busy = false;
                }
            },
        },
        template: `
            <modal-dialog :title="editing ? 'Edit ' + trek.name : 'Add trek'" size="modal-lg" @close="$emit('close')">
                <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
                <p v-if="started" class="small text-body-secondary">Started treks keep their dates and can only be Open or Closed.</p>
                <form ref="form" novalidate @submit.prevent="submit" id="trek-form">
                    <div class="row g-3">
                        <div class="col-md-7">
                            <label for="tf-name" class="form-label">Trek name</label>
                            <input id="tf-name" v-model.trim="form.name" class="form-control" maxlength="120" required>
                            <div class="invalid-feedback">Name is required</div>
                        </div>
                        <div class="col-md-5">
                            <label for="tf-location" class="form-label">Location</label>
                            <input id="tf-location" v-model.trim="form.location" class="form-control" maxlength="100" required placeholder="Uttarakhand">
                            <div class="invalid-feedback">Location is required</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-diff" class="form-label">Difficulty</label>
                            <select id="tf-diff" v-model="form.difficulty" class="form-select" required>
                                <option>Easy</option><option>Moderate</option><option>Hard</option>
                            </select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-start" class="form-label">Start date</label>
                            <input id="tf-start" v-model="form.start_date" type="date" class="form-control" :min="editing ? null : today" :disabled="!!started" required>
                            <div class="invalid-feedback">Today or later</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-end" class="form-label">End date</label>
                            <input id="tf-end" v-model="form.end_date" type="date" class="form-control" :min="form.start_date || today" :disabled="!!started" required>
                            <div class="invalid-feedback">On or after the start date</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <span class="form-label d-block">Duration</span>
                            <div class="form-control bg-body-tertiary mono">{{ duration ? $fmt.days(duration) : '—' }}</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-slots" class="form-label">Seats</label>
                            <input id="tf-slots" v-model.number="form.total_slots" type="number" :min="minSlots" max="500" class="form-control mono" required>
                            <div class="invalid-feedback">From {{ minSlots }} to 500</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-price" class="form-label">Price (₹)</label>
                            <input id="tf-price" v-model.number="form.price" type="number" min="0" step="0.01" class="form-control mono" required>
                            <div class="invalid-feedback">0 or more</div>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-status" class="form-label">Status</label>
                            <select id="tf-status" v-model="form.status" class="form-select">
                                <option v-for="s in statusOptions" :key="s">{{ s }}</option>
                            </select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="tf-staff" class="form-label">Trek leader</label>
                            <select id="tf-staff" v-model="form.assigned_staff_id" class="form-select">
                                <option value="">Not assigned</option>
                                <option v-if="trek && trek.assigned_staff && !staffOptions.some(s => s.id === trek.assigned_staff.id)"
                                        :value="trek.assigned_staff.id">{{ trek.assigned_staff.name }} (inactive)</option>
                                <option v-for="s in staffOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                            </select>
                        </div>
                        <div class="col-12">
                            <label for="tf-image" class="form-label">Photo URL (optional)</label>
                            <input id="tf-image" v-model.trim="form.image_url" type="text" class="form-control" maxlength="500"
                                   pattern="(https?://|/static/).+" placeholder="https://… or /static/assets/…">
                            <div class="invalid-feedback">Use a full http(s) link, or a /static/ path for a photo in frontend/src/assets</div>
                        </div>
                        <div class="col-12">
                            <label for="tf-desc" class="form-label">Description</label>
                            <textarea id="tf-desc" v-model.trim="form.description" class="form-control" rows="3" maxlength="2000"
                                      placeholder="Route, highlights, what is included"></textarea>
                        </div>
                    </div>
                </form>
                <template #footer>
                    <button class="btn btn-quiet" @click="$emit('close')">Cancel</button>
                    <button class="btn btn-primary" form="trek-form" :disabled="busy">
                        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>{{ editing ? 'Save trek' : 'Create trek' }}
                    </button>
                </template>
            </modal-dialog>`,
    };

    const AdminTreks = {
        mixins: [listMixin],
        components: { TrekFormModal, ListFilters },
        data() {
            return {
                endpoint: "/api/admin/treks", editing: null, showForm: false, staffOptions: [],
                statuses: ["Pending", "Approved", "Open", "Closed", "Ongoing", "Completed"],
            };
        },
        async created() {
            try { this.staffOptions = (await window.api.get("/api/admin/staff/options")).data; } catch (e) { /* form still works without */ }
            if (this.$route.query.new) this.openNew();
            if (this.$route.query.edit) {
                try { this.openEdit((await window.api.get(`/api/admin/treks/${this.$route.query.edit}`)).data); }
                catch (e) { window.store.toast(e.message, "danger"); }
            }
        },
        methods: {
            openNew() { this.editing = null; this.showForm = true; },
            openEdit(t) { this.editing = t; this.showForm = true; },
            closeForm() {
                this.showForm = false;
                if (this.$route.query.new || this.$route.query.edit) this.$router.replace("/admin/treks");
            },
            onSaved(message) {
                this.closeForm();
                window.store.toast(message || "Saved.");
                this.load();
            },
            async remove(t) {
                const yes = await window.store.confirm({
                    title: `Delete ${t.name}?`,
                    message: "It will be removed permanently. Treks with bookings can't be deleted; close them instead.",
                    confirmText: "Delete trek",
                });
                if (!yes) return;
                try {
                    const res = await window.api.del(`/api/admin/treks/${t.id}`);
                    window.store.toast(res.message);
                    this.load();
                } catch (e) {
                    window.store.toast(e.message, "danger");
                }
            },
        },
        template: `
            <div>
                <page-header title="Treks">
                    <button class="btn btn-primary" @click="openNew">Add trek</button>
                </page-header>
                <list-filters v-model:q="q" v-model:status="status" :statuses="statuses" placeholder="Search name or location" @search="search"></list-filters>

                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div class="card">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead><tr><th>Trek</th><th>Dates</th><th>Seats</th><th>Leader</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="6"><loading-block></loading-block></td></tr>
                                <tr v-else-if="!rows.length"><td colspan="6" class="text-body-secondary py-4">No treks match</td></tr>
                                <tr v-for="t in rows" :key="t.id" v-show="!loading">
                                    <td><div class="fw-medium">{{ t.name }}</div><div class="small text-body-secondary">{{ t.location }} · {{ t.difficulty }}</div></td>
                                    <td class="mono">{{ $fmt.range(t.start_date, t.end_date) }}</td>
                                    <td><seat-strip :total="t.total_slots" :taken="t.booked_count" :done="t.status === 'Completed'"></seat-strip></td>
                                    <td class="small" :class="{ 'text-warn': !t.assigned_staff && t.status !== 'Completed' }">{{ t.assigned_staff ? t.assigned_staff.name : 'None' }}</td>
                                    <td><status-badge :status="t.display_status"></status-badge></td>
                                    <td class="text-end text-nowrap">
                                        <router-link class="btn btn-sm btn-link" :to="{ path: '/admin/bookings', query: { trek_id: t.id, trek: t.name } }">Bookings</router-link>
                                        <button v-if="t.status !== 'Completed'" class="btn btn-sm btn-quiet" @click="openEdit(t)">Edit</button>
                                        <button v-if="!t.booked_count && t.status !== 'Completed'" class="btn btn-sm btn-danger-quiet ms-1" @click="remove(t)">Delete</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <pagination-bar :page="page" :pages="pages" :total="total" @change="goTo"></pagination-bar>

                <trek-form-modal v-if="showForm" :trek="editing" :staff-options="staffOptions" @close="closeForm" @saved="onSaved"></trek-form-modal>
            </div>`,
    };

    // Staff.
    const StaffFormModal = {
        props: { staff: Object },
        emits: ["close", "saved"],
        data() {
            const s = this.staff;
            return {
                form: s ? {
                    name: s.name, phone: s.phone || "", contact: s.contact || "", specialization: s.specialization || "",
                    experience_years: s.experience_years,
                } : { name: "", email: "", phone: "", contact: "", password: "", confirm_password: "", specialization: "", experience_years: 0, status: "Active" },
                error: "",
                busy: false,
            };
        },
        computed: {
            editing() { return !!this.staff; },
            mismatch() { return !this.editing && this.form.confirm_password.length > 0 && this.form.password !== this.form.confirm_password; },
        },
        methods: {
            async submit() {
                const formEl = this.$refs.form;
                const confirm = formEl.querySelector("#sf-confirm");
                if (confirm) confirm.setCustomValidity(this.mismatch ? "Passwords do not match" : "");
                if (!formEl.checkValidity()) {
                    formEl.classList.add("was-validated");
                    return;
                }
                this.busy = true;
                this.error = "";
                try {
                    const res = this.editing
                        ? await window.api.put(`/api/admin/staff/${this.staff.id}`, this.form)
                        : await window.api.post("/api/admin/staff", this.form);
                    this.$emit("saved", res.message);
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.busy = false;
                }
            },
        },
        template: `
            <modal-dialog :title="editing ? 'Edit ' + staff.name : 'Add trek staff'" size="modal-lg" @close="$emit('close')">
                <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
                <form ref="form" id="staff-form" novalidate @submit.prevent="submit">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label for="sf-name" class="form-label">Full name</label>
                            <input id="sf-name" v-model.trim="form.name" class="form-control" maxlength="100" required>
                            <div class="invalid-feedback">Name is required</div>
                        </div>
                        <div class="col-md-6">
                            <label for="sf-email" class="form-label">Email (their login)</label>
                            <input v-if="!editing" id="sf-email" v-model.trim="form.email" type="email" class="form-control" maxlength="120" required>
                            <input v-else id="sf-email" :value="staff.email" class="form-control" disabled>
                            <div class="invalid-feedback">Enter a valid email</div>
                        </div>
                        <div class="col-md-6">
                            <label for="sf-phone" class="form-label">Phone</label>
                            <input id="sf-phone" v-model.trim="form.phone" type="tel" class="form-control" pattern="\\+?[0-9 \\-]{7,15}" required>
                            <div class="invalid-feedback">Use 7–15 digits</div>
                        </div>
                        <div class="col-md-6">
                            <label for="sf-contact" class="form-label">Field contact (optional)</label>
                            <input id="sf-contact" v-model.trim="form.contact" type="tel" class="form-control" pattern="\\+?[0-9 \\-]{7,15}" placeholder="Satellite or backup number">
                            <div class="invalid-feedback">Use 7–15 digits</div>
                        </div>
                        <template v-if="!editing">
                            <div class="col-md-6">
                                <label for="sf-password" class="form-label">Password</label>
                                <input id="sf-password" v-model="form.password" type="password" class="form-control" minlength="6" autocomplete="new-password" required>
                                <div class="invalid-feedback">At least 6 characters</div>
                            </div>
                            <div class="col-md-6">
                                <label for="sf-confirm" class="form-label">Confirm password</label>
                                <input id="sf-confirm" v-model="form.confirm_password" type="password" class="form-control" :class="{ 'is-invalid': mismatch }" autocomplete="new-password" required>
                                <div class="invalid-feedback">Passwords must match</div>
                            </div>
                        </template>
                        <div class="col-md-6">
                            <label for="sf-spec" class="form-label">Specialization</label>
                            <input id="sf-spec" v-model.trim="form.specialization" class="form-control" maxlength="120" placeholder="Snow treks, first aid">
                        </div>
                        <div class="col-6 col-md-3">
                            <label for="sf-exp" class="form-label">Years of experience</label>
                            <input id="sf-exp" v-model.number="form.experience_years" type="number" min="0" max="60" class="form-control mono" required>
                            <div class="invalid-feedback">0 to 60</div>
                        </div>
                        <div v-if="!editing" class="col-6 col-md-3">
                            <label for="sf-status" class="form-label">Account</label>
                            <select id="sf-status" v-model="form.status" class="form-select"><option>Active</option><option>Inactive</option></select>
                        </div>
                    </div>
                </form>
                <template #footer>
                    <button class="btn btn-quiet" @click="$emit('close')">Cancel</button>
                    <button class="btn btn-primary" form="staff-form" :disabled="busy">
                        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>{{ editing ? 'Save' : 'Create account' }}
                    </button>
                </template>
            </modal-dialog>`,
    };

    // Account status actions.
    async function toggleAccount(vm, row, kind, basePath, label) {
        const blacklist = kind === "blacklist";
        const turningOn = blacklist ? !row.is_blacklisted : !row.is_active;
        const verb = blacklist ? (turningOn ? "Blacklist" : "Whitelist") : (turningOn ? "Activate" : "Deactivate");
        const consequence = {
            Blacklist: `${row.name} is logged out at once and can't log in${label === "trekker" ? " or book" : ""} until whitelisted.`,
            Whitelist: `${row.name} can log in again.`,
            Deactivate: `${row.name}'s account is switched off and they are logged out at once.`,
            Activate: `${row.name}'s account is switched back on.`,
        }[verb];
        const yes = await window.store.confirm({
            title: `${verb} ${row.name}?`, message: consequence, confirmText: verb,
            variant: verb === "Blacklist" || verb === "Deactivate" ? "danger" : "primary",
        });
        if (!yes) return;
        try {
            const body = blacklist ? { blacklisted: turningOn } : { active: turningOn };
            const res = await window.api.put(`${basePath}/${row.id}/${blacklist ? "blacklist" : "active"}`, body);
            window.store.toast(res.message);
            vm.load();
        } catch (e) {
            window.store.toast(e.message, "danger");
        }
    }

    const AdminStaff = {
        mixins: [listMixin],
        components: { StaffFormModal, ListFilters },
        data() { return { endpoint: "/api/admin/staff", editing: null, showForm: false }; },
        methods: {
            openNew() { this.editing = null; this.showForm = true; },
            openEdit(s) { this.editing = s; this.showForm = true; },
            onSaved(message) { this.showForm = false; window.store.toast(message || "Saved."); this.load(); },
            toggle(s, kind) { toggleAccount(this, s, kind, "/api/admin/staff", "staff member"); },
        },
        template: `
            <div>
                <page-header title="Trek staff">
                    <button class="btn btn-primary" @click="openNew">Add staff</button>
                </page-header>
                <list-filters v-model:q="q" v-model:status="status" :statuses="['Active','Inactive','Blacklisted']" placeholder="Search name, email or phone" @search="search"></list-filters>

                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div class="card">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Specialization</th><th>Treks</th><th>Account</th><th></th></tr></thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="7"><loading-block></loading-block></td></tr>
                                <tr v-else-if="!rows.length"><td colspan="7" class="text-body-secondary py-4">No staff match</td></tr>
                                <tr v-for="s in rows" :key="s.id" v-show="!loading">
                                    <td class="mono text-body-secondary">{{ s.code }}</td>
                                    <td><div class="fw-medium">{{ s.name }}</div><div class="small text-body-secondary">{{ s.email }}</div></td>
                                    <td class="mono">{{ s.phone || '—' }}<div v-if="s.contact && s.contact !== s.phone" class="text-body-secondary">{{ s.contact }}</div></td>
                                    <td class="small">{{ s.specialization || '—' }}<div class="text-body-secondary">{{ s.experience_years }} yrs</div></td>
                                    <td class="mono" :title="s.assigned_treks.map(t => t.name).join(', ')">{{ s.assigned_treks.length }}</td>
                                    <td><status-badge :status="s.status" kind="account"></status-badge></td>
                                    <td class="text-end text-nowrap">
                                        <button class="btn btn-sm btn-quiet" @click="openEdit(s)">Edit</button>
                                        <button class="btn btn-sm btn-quiet ms-1" @click="toggle(s, 'active')">{{ s.is_active ? 'Deactivate' : 'Activate' }}</button>
                                        <button class="btn btn-sm ms-1" :class="s.is_blacklisted ? 'btn-quiet' : 'btn-danger-quiet'" @click="toggle(s, 'blacklist')">{{ s.is_blacklisted ? 'Whitelist' : 'Blacklist' }}</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <pagination-bar :page="page" :pages="pages" :total="total" @change="goTo"></pagination-bar>

                <staff-form-modal v-if="showForm" :staff="editing" @close="showForm = false" @saved="onSaved"></staff-form-modal>
            </div>`,
    };

    // Trekkers.
    const AdminUsers = {
        mixins: [listMixin],
        components: { ListFilters },
        data() { return { endpoint: "/api/admin/users" }; },
        methods: {
            toggle(u, kind) { toggleAccount(this, u, kind, "/api/admin/users", "trekker"); },
        },
        template: `
            <div>
                <page-header title="Trekkers"></page-header>
                <list-filters v-model:q="q" v-model:status="status" :statuses="['Active','Inactive','Blacklisted']" placeholder="Search name, email or phone" @search="search"></list-filters>

                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div class="card">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead><tr><th>Name</th><th>Phone</th><th>Bookings</th><th>Joined</th><th>Account</th><th></th></tr></thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="6"><loading-block></loading-block></td></tr>
                                <tr v-else-if="!rows.length"><td colspan="6" class="text-body-secondary py-4">No trekkers match</td></tr>
                                <tr v-for="u in rows" :key="u.id" v-show="!loading">
                                    <td><div class="fw-medium">{{ u.name }}</div><div class="small text-body-secondary">{{ u.email }}</div></td>
                                    <td class="mono">{{ u.phone || '—' }}</td>
                                    <td class="small">
                                        <router-link :to="{ path: '/admin/bookings', query: { q: u.email } }">{{ u.bookings.Booked }} active</router-link>
                                        <div class="text-body-secondary">{{ u.bookings.Completed }} done, {{ u.bookings.Cancelled }} cancelled</div>
                                    </td>
                                    <td class="mono text-body-secondary">{{ $fmt.date(u.created_at) }}</td>
                                    <td><status-badge :status="u.status" kind="account"></status-badge></td>
                                    <td class="text-end text-nowrap">
                                        <button class="btn btn-sm btn-quiet" @click="toggle(u, 'active')">{{ u.is_active ? 'Deactivate' : 'Activate' }}</button>
                                        <button class="btn btn-sm ms-1" :class="u.is_blacklisted ? 'btn-quiet' : 'btn-danger-quiet'" @click="toggle(u, 'blacklist')">{{ u.is_blacklisted ? 'Whitelist' : 'Blacklist' }}</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <pagination-bar :page="page" :pages="pages" :total="total" @change="goTo"></pagination-bar>
            </div>`,
    };

    // Bookings.
    const AdminBookings = {
        mixins: [listMixin],
        components: { ListFilters },
        data() {
            return { endpoint: "/api/admin/bookings", q: this.$route.query.q || "", trekId: this.$route.query.trek_id || "", trekName: this.$route.query.trek || "" };
        },
        watch: {
            "$route.query"(query) {
                this.q = query.q || "";
                this.trekId = query.trek_id || "";
                this.trekName = query.trek || "";
                this.search();
            },
        },
        methods: {
            extraParams() { return { trek_id: this.trekId }; },
            clearTrek() { this.$router.replace({ path: "/admin/bookings" }); },
        },
        template: `
            <div>
                <page-header title="Bookings"></page-header>
                <list-filters v-model:q="q" v-model:status="status" :statuses="['Booked','Completed','Cancelled']" placeholder="Search trekker or trek" @search="search"></list-filters>
                <div v-if="trekId" class="mb-3">
                    <span class="filter-chip">{{ trekName || ('Trek ' + trekId) }}
                        <button class="btn-close" style="font-size: .55rem" aria-label="Show all treks" @click="clearTrek"></button>
                    </span>
                </div>

                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div class="card">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead><tr><th>#</th><th>Trekker</th><th>Trek</th><th>Trek dates</th><th>Booked</th><th class="text-end">Amount</th><th>Status</th></tr></thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="7"><loading-block></loading-block></td></tr>
                                <tr v-else-if="!rows.length"><td colspan="7" class="text-body-secondary py-4">No bookings match</td></tr>
                                <tr v-for="b in rows" :key="b.id" v-show="!loading">
                                    <td class="mono text-body-secondary">{{ b.id }}</td>
                                    <td><div class="fw-medium">{{ b.user.name }}</div><div class="small text-body-secondary">{{ b.user.email }}</div></td>
                                    <td>{{ b.trek.name }}<div class="small text-body-secondary">{{ b.trek.location }}</div></td>
                                    <td class="mono">{{ $fmt.range(b.trek.start_date, b.trek.end_date) }}</td>
                                    <td class="mono text-body-secondary">{{ $fmt.date(b.booking_date) }}</td>
                                    <td class="mono text-end">{{ $fmt.money(b.amount) }}<div><status-badge :status="b.payment_status" kind="payment"></status-badge></div></td>
                                    <td><status-badge :status="b.status" kind="booking"></status-badge>
                                        <div class="mono small text-body-secondary" v-if="b.cancelled_on || b.completed_on">{{ $fmt.date(b.cancelled_on || b.completed_on) }}</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <pagination-bar :page="page" :pages="pages" :total="total" @change="goTo"></pagination-bar>
            </div>`,
    };

    // Reports.
    const AdminReports = {
        data() { return { report: null, error: "" }; },
        async created() {
            try {
                this.report = (await window.api.get("/api/admin/reports")).data;
                this.$nextTick(this.drawChart);
            } catch (e) {
                this.error = e.message;
            }
        },
        beforeUnmount() { if (this.chart) this.chart.destroy(); },
        methods: {
            drawChart() {
                if (typeof Chart === "undefined" || !this.$refs.monthly) return;
                const css = getComputedStyle(document.documentElement);
                const pine = css.getPropertyValue("--tma-pine").trim();
                const ink = css.getPropertyValue("--tma-text-3").trim();
                const line = "rgba(23,32,28,0.08)";
                const m = this.report.monthly_participation;
                this.chart = new Chart(this.$refs.monthly, {
                    type: "bar",
                    data: {
                        labels: m.map((x) => x.label.slice(0, 3)),
                        datasets: [
                            { label: "Trekkers who finished a trek", data: m.map((x) => x.participants), backgroundColor: pine, borderRadius: 2, maxBarThickness: 28 },
                            { label: "Bookings made", data: m.map((x) => x.bookings), backgroundColor: "rgba(23,32,28,0.16)", borderRadius: 2, maxBarThickness: 28 },
                        ],
                    },
                    options: {
                        maintainAspectRatio: false,
                        plugins: { legend: { position: "bottom", align: "start", labels: { boxWidth: 10, color: ink } } },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: ink } },
                            y: { beginAtZero: true, ticks: { precision: 0, color: ink }, grid: { color: line }, border: { display: false } },
                        },
                    },
                });
            },
        },
        template: `
            <div>
                <page-header title="Reports"></page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!report"></loading-block>
                <template v-else>
                    <div class="card mb-4">
                        <div class="card-header"><h2 class="h6 mb-0">Participation, last 12 months</h2></div>
                        <div class="card-body"><div class="chart-box"><canvas ref="monthly" role="img" aria-label="Monthly bar chart of trekkers who finished a trek and bookings made"></canvas></div></div>
                    </div>

                    <div class="row g-4">
                        <div class="col-lg-5">
                            <div class="card h-100">
                                <div class="card-header"><h2 class="h6 mb-0">Most booked treks, all time</h2></div>
                                <div class="card-body pt-2">
                                    <ol v-if="report.popular_treks.length" class="rank">
                                        <li v-for="t in report.popular_treks" :key="t.id">
                                            <span>{{ t.name }}<span class="d-block small text-body-secondary">{{ t.location }}</span></span>
                                            <span class="mono">{{ t.bookings }}</span>
                                        </li>
                                    </ol>
                                    <p v-else class="text-body-secondary small mb-0">No bookings yet</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-7">
                            <div class="card h-100">
                                <div class="card-header"><h2 class="h6 mb-0">{{ report.last_month.label }}</h2></div>
                                <div class="card-body pt-2">
                                    <dl class="row mb-3">
                                        <dt class="col-7 fw-normal text-body-secondary">Treks completed</dt><dd class="col-5 mono text-end">{{ report.last_month.treks_conducted }}</dd>
                                        <dt class="col-7 fw-normal text-body-secondary">Trekkers who took part</dt><dd class="col-5 mono text-end">{{ report.last_month.participants }}</dd>
                                        <dt class="col-7 fw-normal text-body-secondary">New bookings</dt><dd class="col-5 mono text-end">{{ report.last_month.new_bookings }}</dd>
                                        <dt class="col-7 fw-normal text-body-secondary">Cancellations</dt><dd class="col-5 mono text-end">{{ report.last_month.cancellations }}</dd>
                                        <dt class="col-7 fw-normal text-body-secondary">Payments received</dt><dd class="col-5 mono text-end mb-0">{{ $fmt.money(report.last_month.revenue) }}</dd>
                                    </dl>
                                    <div class="small text-body-secondary">Completed that month</div>
                                    <ul class="list-unstyled attention mb-0">
                                        <li v-for="t in report.last_month.conducted_treks" :key="t.id">
                                            <span>{{ t.name }}</span><span class="mono text-body-secondary">{{ t.participants }} trekkers</span>
                                        </li>
                                        <li v-if="!report.last_month.conducted_treks.length" class="text-body-secondary small">None</li>
                                    </ul>
                                    <p class="small text-body-secondary mt-3 mb-0">The admin gets this summary by email on the 1st of each month.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>`,
    };

    window.AdminViews = { AdminDashboard, AdminTreks, AdminStaff, AdminUsers, AdminBookings, AdminReports };
})();
