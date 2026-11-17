// Staff pages.
(function () {
    const StaffTrekTable = {
        props: { treks: Array, empty: String },
        template: `
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead><tr><th>Trek</th><th>Dates</th><th>Registered</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="t in treks" :key="t.id">
                            <td><div class="fw-medium">{{ t.name }}</div><div class="small text-body-secondary">{{ t.location }} · {{ t.difficulty }}</div></td>
                            <td class="mono">{{ $fmt.range(t.start_date, t.end_date) }}</td>
                            <td><seat-strip :total="t.total_slots" :taken="t.status === 'Completed' ? t.registered.Completed : t.booked_count" :done="t.status === 'Completed'"></seat-strip></td>
                            <td><status-badge :status="t.display_status"></status-badge></td>
                            <td class="text-end"><router-link class="btn btn-sm btn-quiet" :to="'/staff/treks/' + t.id">{{ t.status === 'Completed' ? 'View' : 'Manage' }}</router-link></td>
                        </tr>
                        <tr v-if="!treks.length"><td colspan="5" class="text-body-secondary py-4">{{ empty }}</td></tr>
                    </tbody>
                </table>
            </div>`,
    };

    const StaffDashboard = {
        components: { StaffTrekTable },
        data() { return { stats: null, treks: null, error: "" }; },
        async created() {
            try {
                const [s, t] = await Promise.all([window.api.get("/api/staff/stats"), window.api.get("/api/staff/treks")]);
                this.stats = s.data;
                this.treks = t.data;
            } catch (e) {
                this.error = e.message;
            }
        },
        computed: {
            upcoming() { return (this.treks || []).filter((t) => t.status !== "Completed"); },
            figures() {
                const s = this.stats;
                return [
                    { label: "Assigned treks", value: s.assigned_treks, to: "/staff/treks" },
                    { label: "Trekkers booked", value: s.total_participants },
                    { label: "On the trail now", value: s.ongoing_treks },
                    { label: "Completed", value: s.completed_treks },
                ];
            },
        },
        template: `
            <div>
                <page-header title="Overview"></page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!stats"></loading-block>
                <template v-else>
                    <figure-row :items="figures" class="mb-4"></figure-row>
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-baseline">
                            <h2 class="h6 mb-0">Coming up</h2>
                            <router-link to="/staff/treks" class="small">All my treks</router-link>
                        </div>
                        <staff-trek-table :treks="upcoming" empty="No upcoming treks are assigned to you"></staff-trek-table>
                    </div>
                </template>
            </div>`,
    };

    const StaffTreks = {
        components: { StaffTrekTable },
        data() { return { treks: null, error: "", filter: "" }; },
        async created() {
            try { this.treks = (await window.api.get("/api/staff/treks")).data; }
            catch (e) { this.error = e.message; }
        },
        computed: {
            shown() {
                const all = this.treks || [];
                return this.filter ? all.filter((t) => t.display_status === this.filter) : all;
            },
        },
        template: `
            <div>
                <page-header title="My treks">
                    <select v-model="filter" class="form-select" aria-label="Filter by status" style="min-width: 11rem">
                        <option value="">All statuses</option>
                        <option v-for="s in ['Approved','Open','Closed','Ongoing','Completed']" :key="s">{{ s }}</option>
                    </select>
                </page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!treks"></loading-block>
                <div v-else class="card"><staff-trek-table :treks="shown" empty="No treks match"></staff-trek-table></div>
            </div>`,
    };

    const StaffTrekManage = {
        data() { return { trek: null, error: "", form: { available_slots: 0, status: "Open" }, busy: false, showCancelled: false }; },
        created() { this.load(); },
        computed: {
            completed() { return this.trek && this.trek.status === "Completed"; },
            started() { return this.trek && !!this.trek.started_at; },
            canToggle() { return this.trek && ["Approved", "Open", "Closed"].includes(this.trek.status); },
            participants() {
                const list = this.trek ? this.trek.participants : [];
                return this.showCancelled ? list : list.filter((p) => p.status !== "Cancelled");
            },
            cancelledCount() { return this.trek ? this.trek.participants.filter((p) => p.status === "Cancelled").length : 0; },
            previewTotal() { return this.trek.registered.Booked + (Number(this.form.available_slots) || 0); },
        },
        methods: {
            async load() {
                try {
                    const res = await window.api.get(`/api/staff/treks/${this.$route.params.id}`);
                    this.trek = res.data;
                    this.form = { available_slots: res.data.available_slots, status: res.data.status === "Approved" ? "Open" : res.data.status };
                } catch (e) {
                    this.error = e.message;
                }
            },
            async save(event) {
                if (!event.target.checkValidity()) { event.target.classList.add("was-validated"); return; }
                this.busy = true;
                try {
                    const body = { available_slots: this.form.available_slots };
                    if (this.canToggle) body.status = this.form.status;
                    const res = await window.api.put(`/api/staff/treks/${this.trek.id}`, body);
                    window.store.toast(res.message);
                    await this.load();
                } catch (e) {
                    window.store.toast(e.message, "danger");
                } finally {
                    this.busy = false;
                }
            },
            async action(kind) {
                const copy = {
                    start: { title: `Start ${this.trek.name}?`, message: "Bookings and cancellations stop once the trek has started.", confirmText: "Mark as started", variant: "primary" },
                    complete: { title: `Complete ${this.trek.name}?`, message: "Every active booking becomes Completed and moves to the trekkers' history. This can't be undone.", confirmText: "Mark as completed", variant: "primary" },
                }[kind];
                if (!(await window.store.confirm(copy))) return;
                try {
                    const res = await window.api.put(`/api/staff/treks/${this.trek.id}/${kind}`);
                    window.store.toast(res.message);
                    await this.load();
                } catch (e) {
                    window.store.toast(e.message, "danger");
                }
            },
            async removeParticipant(p) {
                const yes = await window.store.confirm({
                    title: `Remove ${p.user.name}?`,
                    message: "Their booking is cancelled and the seat goes back on sale.",
                    confirmText: "Remove",
                });
                if (!yes) return;
                try {
                    const res = await window.api.put(`/api/staff/treks/${this.trek.id}/participants/${p.id}/cancel`);
                    window.store.toast(res.message);
                    await this.load();
                } catch (e) {
                    window.store.toast(e.message, "danger");
                }
            },
        },
        template: `
            <div>
                <router-link to="/staff/treks" class="small d-inline-block mb-3">← My treks</router-link>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!trek"></loading-block>
                <template v-else>
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <h1 class="page-title">{{ trek.name }}</h1>
                        <status-badge :status="trek.display_status"></status-badge>
                    </div>
                    <p class="text-body-secondary mb-4">{{ trek.location }} · {{ trek.difficulty }} · <span class="mono">{{ $fmt.range(trek.start_date, trek.end_date) }}</span></p>

                    <div class="row g-4">
                        <div class="col-lg-4">
                            <div class="card mb-4">
                                <div class="card-body">
                                    <seat-strip :total="trek.total_slots" :taken="completed ? trek.registered.Completed : trek.booked_count" :done="completed" size="lg" class="mb-3"></seat-strip>
                                    <dl class="row small mb-0">
                                        <dt class="col-6 fw-normal text-body-secondary">Booked</dt><dd class="col-6 mono text-end">{{ trek.registered.Booked }}</dd>
                                        <dt class="col-6 fw-normal text-body-secondary">Capacity</dt><dd class="col-6 mono text-end">{{ trek.total_slots }}</dd>
                                        <dt class="col-6 fw-normal text-body-secondary">Price</dt><dd class="col-6 mono text-end">{{ $fmt.money(trek.price) }}</dd>
                                        <template v-if="trek.started_at"><dt class="col-6 fw-normal text-body-secondary">Started</dt><dd class="col-6 mono text-end">{{ $fmt.dateTime(trek.started_at) }}</dd></template>
                                        <template v-if="trek.completed_at"><dt class="col-6 fw-normal text-body-secondary">Completed</dt><dd class="col-6 mono text-end mb-0">{{ $fmt.dateTime(trek.completed_at) }}</dd></template>
                                    </dl>
                                </div>
                            </div>

                            <form v-if="!completed" class="card mb-4" novalidate @submit.prevent="save">
                                <div class="card-body">
                                    <h2 class="h6 mb-3">Seats and bookings</h2>
                                    <p v-if="trek.status === 'Pending'" class="small text-warn">The admin hasn't approved this trek yet, so it can't open for booking.</p>
                                    <div class="mb-3">
                                        <label for="st-slots" class="form-label">Free seats</label>
                                        <input id="st-slots" v-model.number="form.available_slots" type="number" min="0" :max="500 - trek.registered.Booked" class="form-control mono" required>
                                        <div class="form-text mono">{{ trek.registered.Booked }} booked + {{ form.available_slots || 0 }} free = {{ previewTotal }} seats</div>
                                        <div class="invalid-feedback">0 or more</div>
                                    </div>
                                    <div class="mb-3" v-if="canToggle">
                                        <label for="st-status" class="form-label">Bookings</label>
                                        <select id="st-status" v-model="form.status" class="form-select">
                                            <option value="Open">Open</option>
                                            <option value="Closed">Closed</option>
                                        </select>
                                    </div>
                                    <button class="btn btn-quiet w-100" :disabled="busy">Save</button>
                                </div>
                            </form>

                            <div v-if="!completed" class="d-grid gap-2">
                                <button v-if="!started" class="btn btn-primary" :disabled="!['Open','Closed'].includes(trek.status)" @click="action('start')">Mark as started</button>
                                <button v-else class="btn btn-primary" @click="action('complete')">Mark as completed</button>
                                <p class="small text-body-secondary mb-0">{{ started ? 'Complete the trek when the group is back.' : 'Start the trek on the day it begins.' }}</p>
                            </div>
                        </div>

                        <div class="col-lg-8">
                            <div class="card">
                                <div class="card-header d-flex flex-wrap justify-content-between align-items-baseline gap-2">
                                    <h2 class="h6 mb-0">Participants <span class="mono text-body-secondary">{{ trek.registered.Booked + trek.registered.Completed }}</span></h2>
                                    <div class="form-check form-switch mb-0" v-if="cancelledCount">
                                        <input id="st-showc" v-model="showCancelled" class="form-check-input" type="checkbox">
                                        <label for="st-showc" class="form-check-label small">Show {{ cancelledCount }} cancelled</label>
                                    </div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table align-middle">
                                        <thead><tr><th>Name</th><th>Contact</th><th>Booked</th><th>Payment</th><th>Status</th><th></th></tr></thead>
                                        <tbody>
                                            <tr v-for="p in participants" :key="p.id">
                                                <td class="fw-medium">{{ p.user.name }}</td>
                                                <td class="small">{{ p.user.email }}<div class="mono text-body-secondary">{{ p.user.phone || '' }}</div></td>
                                                <td class="mono text-body-secondary">{{ $fmt.date(p.booking_date) }}</td>
                                                <td><status-badge :status="p.payment_status" kind="payment"></status-badge></td>
                                                <td><status-badge :status="p.status" kind="booking"></status-badge></td>
                                                <td class="text-end">
                                                    <button v-if="p.status === 'Booked' && !started" class="btn btn-sm btn-link text-danger" @click="removeParticipant(p)">Remove</button>
                                                </td>
                                            </tr>
                                            <tr v-if="!participants.length"><td colspan="6" class="text-body-secondary py-4">No one has booked yet</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>`,
    };

    window.StaffViews = { StaffDashboard, StaffTreks, StaffTrekManage };
})();
