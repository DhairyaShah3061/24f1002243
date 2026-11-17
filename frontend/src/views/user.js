// Trekker pages.
(function () {
    async function activeBookings() {
        return (await window.api.get("/api/bookings/mine?status=Booked")).data;
    }

    async function payFor(booking) {
        const yes = await window.store.confirm({
            title: `Pay ${window.fmt.money(booking.amount)} for ${booking.trek.name}?`,
            message: "This is a payment simulation. No money moves.",
            confirmText: "Pay " + window.fmt.money(booking.amount),
            variant: "primary",
        });
        if (!yes) return false;
        const res = await window.api.put(`/api/bookings/${booking.id}/pay`);
        window.store.toast(res.message);
        return true;
    }

    async function cancelBooking(booking) {
        const yes = await window.store.confirm({
            title: `Cancel your seat on ${booking.trek.name}?`,
            message: "The seat goes back on sale. You can book again later if seats are left.",
            confirmText: "Cancel booking",
        });
        if (!yes) return false;
        const res = await window.api.put(`/api/bookings/${booking.id}/cancel`);
        window.store.toast(res.message);
        return true;
    }

    // Your treks.
    const UserDashboard = {
        data() { return { bookings: null, treks: null, error: "" }; },
        async created() { this.load(); },
        computed: {
            bookedIds() { return new Set((this.bookings || []).map((b) => b.trek.id)); },
            bookable() { return (this.treks || []).filter((t) => !this.bookedIds.has(t.id)).slice(0, 6); },
        },
        methods: {
            async load() {
                try {
                    const [mine, open] = await Promise.all([activeBookings(), window.api.get("/api/treks?open_only=1&per_page=9")]);
                    this.bookings = mine;
                    this.treks = open.data.items;
                } catch (e) {
                    this.error = e.message;
                }
            },
            startsIn(b) {
                if (b.trek.is_ongoing) return "On the trail";
                const d = window.fmt.daysUntil(b.trek.start_date);
                return d > 1 ? `in ${d} days` : d === 1 ? "tomorrow" : "today";
            },
            async pay(b) { try { if (await payFor(b)) this.load(); } catch (e) { window.store.toast(e.message, "danger"); } },
        },
        template: `
            <div>
                <page-header title="Your treks">
                    <export-button label="Email my history as CSV"></export-button>
                </page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!bookings"></loading-block>
                <template v-else>
                    <section class="mb-5">
                        <div class="card">
                            <div class="table-responsive">
                                <table class="table align-middle">
                                    <thead><tr><th>Trek</th><th>Dates</th><th>Starts</th><th>Trek status</th><th class="text-end">Payment</th></tr></thead>
                                    <tbody>
                                        <tr v-for="b in bookings" :key="b.id">
                                            <td><router-link :to="'/treks/' + b.trek.id" class="fw-medium">{{ b.trek.name }}</router-link><div class="small text-body-secondary">{{ b.trek.location }}</div></td>
                                            <td class="mono">{{ $fmt.range(b.trek.start_date, b.trek.end_date) }}</td>
                                            <td class="small">{{ startsIn(b) }}</td>
                                            <td><status-badge :status="b.trek.display_status"></status-badge></td>
                                            <td class="text-end">
                                                <span v-if="b.payment_status === 'Paid'" class="small text-body-secondary">Paid</span>
                                                <button v-else class="btn btn-sm btn-primary" @click="pay(b)">Pay <span class="mono">{{ $fmt.money(b.amount) }}</span></button>
                                            </td>
                                        </tr>
                                        <tr v-if="!bookings.length"><td colspan="5" class="text-body-secondary py-4">You haven't booked a trek yet. The ones below have seats.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    <section>
                        <div class="d-flex justify-content-between align-items-baseline mb-3">
                            <h2 class="h5 mb-0">Seats available</h2>
                            <router-link to="/treks" class="small">Search all treks</router-link>
                        </div>
                        <div v-if="bookable.length" class="row g-3">
                            <div v-for="t in bookable" :key="t.id" class="col-sm-6 col-lg-4">
                                <trek-card :trek="t" :booked-ids="bookedIds"></trek-card>
                            </div>
                        </div>
                        <empty-state v-else title="No other treks have seats right now"></empty-state>
                    </section>
                </template>
            </div>`,
    };

    // Browse.
    const TrekBrowse = {
        data() {
            const q = this.$route.query;
            return {
                filters: { q: q.q || "", difficulty: q.difficulty || "", location: q.location || "", duration: q.duration || "", open_only: q.open_only === "1" },
                page: Number(q.page) || 1,
                result: null,
                locations: [],
                bookedIds: new Set(),
                error: "",
                loading: false,
            };
        },
        async created() {
            this.load();
            try {
                const [loc, mine] = await Promise.all([window.api.get("/api/treks/locations"), activeBookings()]);
                this.locations = loc.data;
                this.bookedIds = new Set(mine.map((b) => b.trek.id));
            } catch (e) { /* filters still work without these */ }
        },
        computed: {
            anyFilter() { const f = this.filters; return !!(f.q || f.difficulty || f.location || f.duration || f.open_only); },
        },
        methods: {
            query() {
                const out = {};
                Object.entries(this.filters).forEach(([k, v]) => {
                    if (k === "open_only") { if (v) out[k] = "1"; } else if (v) out[k] = v;
                });
                if (this.page > 1) out.page = String(this.page);
                return out;
            },
            async load() {
                this.loading = true;
                this.error = "";
                this.$router.replace({ query: this.query() });
                try {
                    const params = new URLSearchParams({ ...this.query(), page: this.page, per_page: 9 });
                    this.result = (await window.api.get("/api/treks?" + params)).data;
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.loading = false;
                }
            },
            apply() { this.page = 1; this.load(); },
            reset() { this.filters = { q: "", difficulty: "", location: "", duration: "", open_only: false }; this.apply(); },
            goTo(n) { this.page = n; this.load(); window.scrollTo({ top: 0 }); },
        },
        template: `
            <div>
                <page-header title="Treks"></page-header>

                <form class="row g-2 align-items-center mb-2" role="search" @submit.prevent="apply">
                    <div class="col-12 col-lg-4">
                        <input v-model.trim="filters.q" type="search" class="form-control" placeholder="Search" aria-label="Search treks by name, place or description" @search="apply">
                    </div>
                    <div class="col-4 col-lg-2">
                        <select v-model="filters.difficulty" class="form-select" aria-label="Difficulty" @change="apply">
                            <option value="">Any difficulty</option><option>Easy</option><option>Moderate</option><option>Hard</option>
                        </select>
                    </div>
                    <div class="col-4 col-lg-3">
                        <select v-model="filters.location" class="form-select" aria-label="Location" @change="apply">
                            <option value="">Anywhere</option>
                            <option v-for="l in locations" :key="l">{{ l }}</option>
                        </select>
                    </div>
                    <div class="col-4 col-lg-3">
                        <select v-model="filters.duration" class="form-select" aria-label="Duration" @change="apply">
                            <option value="">Any length</option><option value="1-3">1–3 days</option><option value="4-7">4–7 days</option><option value="8+">8 days or more</option>
                        </select>
                    </div>
                </form>
                <div class="d-flex flex-wrap align-items-center gap-3 mb-4">
                    <div class="form-check form-switch mb-0">
                        <input id="br-open" v-model="filters.open_only" class="form-check-input" type="checkbox" @change="apply">
                        <label for="br-open" class="form-check-label small">Only treks with seats I can book now</label>
                    </div>
                    <span v-if="result" class="small text-body-secondary ms-auto"><span class="mono">{{ result.total }}</span> found</span>
                    <button v-if="anyFilter" type="button" class="btn btn-sm btn-link px-0" @click="reset">Clear</button>
                </div>

                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-if="loading && !result"></loading-block>
                <template v-if="result">
                    <div v-if="result.items.length" class="row g-3" :class="{ 'opacity-50': loading }">
                        <div v-for="t in result.items" :key="t.id" class="col-sm-6 col-lg-4">
                            <trek-card :trek="t" :booked-ids="bookedIds"></trek-card>
                        </div>
                    </div>
                    <empty-state v-else title="No treks match">
                        <button class="btn btn-quiet btn-sm" @click="reset">Clear filters</button>
                    </empty-state>
                    <pagination-bar :page="result.page" :pages="result.pages" :total="result.total" @change="goTo"></pagination-bar>
                </template>
            </div>`,
    };

    // Trek detail.
    const TrekDetail = {
        data() { return { trek: null, myBooking: null, error: "", busy: false }; },
        created() { this.load(); },
        watch: { "$route.params.id"() { this.load(); } },
        computed: {
            blocker() {
                const t = this.trek;
                if (!t || this.myBooking) return "";
                if (t.is_ongoing) return "This trek is already on the trail.";
                if (t.status === "Completed") return "This trek has finished.";
                if (t.status !== "Open") return `Bookings open when the trek leader opens this trek (now ${t.status.toLowerCase()}).`;
                if (t.available_slots <= 0) return "Every seat is taken.";
                if (window.fmt.daysUntil(t.start_date) < 0) return "The start date has passed.";
                return "";
            },
        },
        methods: {
            async load() {
                this.error = "";
                try {
                    const id = Number(this.$route.params.id);
                    const [t, mine] = await Promise.all([window.api.get(`/api/treks/${id}`), activeBookings()]);
                    this.trek = t.data;
                    this.myBooking = mine.find((b) => b.trek.id === id) || null;
                } catch (e) {
                    this.error = e.message;
                }
            },
            async book() {
                const t = this.trek;
                const yes = await window.store.confirm({
                    title: `Book a seat on ${t.name}?`,
                    message: `${window.fmt.range(t.start_date, t.end_date)}, ${t.location}. ${window.fmt.money(t.price)}, payable from Bookings.`,
                    confirmText: "Book seat",
                    variant: "primary",
                });
                if (!yes) return;
                this.busy = true;
                try {
                    const res = await window.api.post("/api/bookings", { trek_id: t.id });
                    window.store.toast(res.message);
                } catch (e) {
                    window.store.toast(e.message, "danger");
                } finally {
                    await this.load();
                    this.busy = false;
                }
            },
        },
        template: `
            <div>
                <router-link to="/treks" class="small d-inline-block mb-3">← Treks</router-link>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!trek"></loading-block>
                <div v-else class="row g-4 g-lg-5">
                    <div class="col-lg-7">
                        <trek-image :src="trek.image_url" :alt="trek.name" :place="trek.location" :height="340" class="rounded-3 mb-4"></trek-image>
                        <h1 class="page-title mb-1">{{ trek.name }}</h1>
                        <p class="text-body-secondary">{{ trek.location }} · {{ trek.difficulty }} · {{ $fmt.days(trek.duration_days) }}</p>
                        <p class="trek-description">{{ trek.description || 'No description yet.' }}</p>

                        <section class="trek-guide" aria-labelledby="guide-glance">
                            <h2 id="guide-glance" class="h5">At a glance</h2>
                            <dl class="row small mb-0">
                                <dt class="col-sm-4 fw-normal text-body-secondary">How long</dt>
                                <dd class="col-sm-8">{{ $fmt.days(trek.guide.days) }}<span v-if="trek.guide.nights"> and {{ trek.guide.nights }} night{{ trek.guide.nights === 1 ? '' : 's' }}</span>, <span class="mono">{{ $fmt.range(trek.start_date, trek.end_date) }}</span></dd>
                                <dt class="col-sm-4 fw-normal text-body-secondary">Difficulty</dt>
                                <dd class="col-sm-8">{{ trek.difficulty }}. {{ trek.guide.difficulty_note }}</dd>
                                <dt class="col-sm-4 fw-normal text-body-secondary">Where to report</dt>
                                <dd class="col-sm-8 mb-0">{{ trek.guide.reporting }}</dd>
                            </dl>
                        </section>

                        <section class="trek-guide" aria-labelledby="guide-carry">
                            <h2 id="guide-carry" class="h5">What to take</h2>
                            <ul class="small mb-0 ps-3">
                                <li v-for="item in trek.guide.what_to_carry" :key="item">{{ item }}</li>
                            </ul>
                        </section>
                    </div>
                    <div class="col-lg-5">
                        <div class="card booking-panel">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-baseline mb-1">
                                    <span class="mono fs-5">{{ $fmt.money(trek.price) }}</span>
                                    <status-badge :status="trek.display_status"></status-badge>
                                </div>
                                <div class="mono text-body-secondary mb-4">{{ $fmt.range(trek.start_date, trek.end_date) }}</div>

                                <seat-strip :total="trek.total_slots" :taken="trek.booked_count" :mine="!!myBooking" size="lg" class="mb-4"></seat-strip>

                                <dl class="row small mb-4">
                                    <dt class="col-5 fw-normal text-body-secondary">Trek leader</dt>
                                    <dd class="col-7 mb-0">{{ trek.assigned_staff ? trek.assigned_staff.name : 'Not assigned yet' }}</dd>
                                </dl>

                                <div v-if="myBooking">
                                    <p class="mb-2"><span class="tag tag-go">Booked</span> <span class="small text-body-secondary ms-1">The green seat is yours.</span></p>
                                    <router-link to="/bookings" class="small">{{ myBooking.payment_status === 'Paid' ? 'Manage booking' : 'Pay or cancel in Bookings' }}</router-link>
                                </div>
                                <template v-else>
                                    <button class="btn btn-primary w-100" :disabled="!!blocker || busy" @click="book">
                                        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>Book a seat
                                    </button>
                                    <p v-if="blocker" class="small text-body-secondary mt-2 mb-0">{{ blocker }}</p>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`,
    };

    // Bookings.
    const MyBookings = {
        data() { return { bookings: null, error: "" }; },
        created() { this.load(); },
        methods: {
            async load() {
                try { this.bookings = await activeBookings(); } catch (e) { this.error = e.message; }
            },
            async pay(b) { try { if (await payFor(b)) this.load(); } catch (e) { window.store.toast(e.message, "danger"); } },
            async cancel(b) { try { if (await cancelBooking(b)) this.load(); } catch (e) { window.store.toast(e.message, "danger"); } },
        },
        template: `
            <div>
                <page-header title="Bookings">
                    <router-link to="/history" class="btn btn-quiet">History</router-link>
                </page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!bookings"></loading-block>
                <empty-state v-else-if="!bookings.length" title="No active bookings" text="Finished and cancelled treks are in History.">
                    <router-link to="/treks" class="btn btn-primary btn-sm">Find a trek</router-link>
                </empty-state>
                <div v-else class="card">
                    <div class="table-responsive">
                        <table class="table align-middle">
                            <thead><tr><th>Trek</th><th>Dates</th><th>Trek status</th><th class="text-end">Amount</th><th></th></tr></thead>
                            <tbody>
                                <tr v-for="b in bookings" :key="b.id">
                                    <td><router-link :to="'/treks/' + b.trek.id" class="fw-medium">{{ b.trek.name }}</router-link>
                                        <div class="small text-body-secondary">{{ b.trek.location }} · booked <span class="mono">{{ $fmt.date(b.booking_date) }}</span></div></td>
                                    <td class="mono">{{ $fmt.range(b.trek.start_date, b.trek.end_date) }}</td>
                                    <td><status-badge :status="b.trek.display_status"></status-badge></td>
                                    <td class="text-end"><span class="mono">{{ $fmt.money(b.amount) }}</span><div><status-badge :status="b.payment_status" kind="payment"></status-badge></div></td>
                                    <td class="text-end text-nowrap">
                                        <button v-if="b.payment_status !== 'Paid'" class="btn btn-sm btn-primary" @click="pay(b)">Pay</button>
                                        <button v-if="!b.trek.is_ongoing" class="btn btn-sm btn-danger-quiet ms-1" @click="cancel(b)">Cancel</button>
                                        <span v-else class="small text-body-secondary">On the trail</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`,
    };

    // History.
    const HistoryView = {
        data() { return { bookings: null, filter: "", error: "" }; },
        async created() {
            try { this.bookings = (await window.api.get("/api/bookings/mine?history=1")).data; }
            catch (e) { this.error = e.message; }
        },
        computed: {
            shown() { return (this.bookings || []).filter((b) => !this.filter || b.status === this.filter); },
        },
        template: `
            <div>
                <page-header title="History">
                    <export-button></export-button>
                </page-header>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <loading-block v-else-if="!bookings"></loading-block>
                <template v-else>
                    <div class="btn-group mb-3" role="group" aria-label="Filter history">
                        <button v-for="f in [['', 'All'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']]" :key="f[0]"
                                class="btn btn-sm btn-quiet" :class="{ active: filter === f[0] }" :aria-pressed="filter === f[0]" @click="filter = f[0]">{{ f[1] }}</button>
                    </div>
                    <empty-state v-if="!shown.length" title="Nothing here yet" text="Treks appear here once they finish or are cancelled."></empty-state>
                    <div v-else class="card">
                        <div class="table-responsive">
                            <table class="table align-middle">
                                <thead><tr><th>Trek</th><th>Trek dates</th><th>Booked</th><th>Finished or cancelled</th><th>Status</th></tr></thead>
                                <tbody>
                                    <tr v-for="b in shown" :key="b.id">
                                        <td class="fw-medium">{{ b.trek.name }}<div class="small fw-normal text-body-secondary">{{ b.trek.location }}</div></td>
                                        <td class="mono">{{ $fmt.range(b.trek.start_date, b.trek.end_date) }}</td>
                                        <td class="mono text-body-secondary">{{ $fmt.date(b.booking_date) }}</td>
                                        <td class="mono">{{ $fmt.date(b.completed_on || b.cancelled_on) }}</td>
                                        <td><status-badge :status="b.status" kind="booking"></status-badge></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </template>
            </div>`,
    };

    window.UserViews = { UserDashboard, TrekBrowse, TrekDetail, MyBookings, HistoryView };
})();
