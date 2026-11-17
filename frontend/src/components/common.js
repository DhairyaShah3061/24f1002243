// Shared components and formatters.
(function () {
    // Format helpers.
    const fmt = {
        date(iso) {
            if (!iso) return "—";
            const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso + (iso.endsWith("Z") ? "" : "Z"));
            return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        },
        short(iso) {
            if (!iso) return "—";
            const d = new Date(iso + "T00:00:00");
            return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        },
        dateTime(iso) {
            if (!iso) return "—";
            const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
            return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        },
        money(n) {
            return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
        },
        range(a, b) {
            if (!a) return "—";
            if (a === b) return fmt.date(a);
            const sameYear = a.slice(0, 4) === b.slice(0, 4);
            return `${sameYear ? fmt.short(a) : fmt.date(a)} – ${fmt.date(b)}`;
        },
        daysUntil(iso) {
            const start = new Date(iso + "T00:00:00");
            const today = new Date(); today.setHours(0, 0, 0, 0);
            return Math.round((start - today) / 86400000);
        },
        days(n) { return `${n} day${n === 1 ? "" : "s"}`; },
    };
    window.fmt = fmt;

    // Status colors.
    const TAG = {
        trek: { Pending: "tag-wait", Approved: "", Open: "tag-go", Closed: "", Ongoing: "tag-live", Completed: "tag-done" },
        booking: { Booked: "", Cancelled: "tag-stop", Completed: "tag-done" },
        account: { Active: "tag-done", Blacklisted: "tag-stop" },
    };

    // Small components.
    const StatusBadge = {
        props: { status: String, kind: { type: String, default: "trek" } },
        computed: {
            label() { return this.kind === "payment" ? (this.status === "Paid" ? "Paid" : "Unpaid") : this.status; },
            cls() {
                if (this.kind === "payment") return this.status === "Paid" ? "tag-done" : "tag-wait";
                return (TAG[this.kind] || {})[this.status] ?? "";
            },
        },
        template: `<span class="tag" :class="cls">{{ label }}</span>`,
    };

    // Key figures.
    const FigureRow = {
        props: { items: Array },
        template: `
            <div class="card">
                <div class="figures">
                    <component v-for="f in items" :key="f.label" :is="f.to ? 'router-link' : 'div'" :to="f.to" class="figure">
                        <div class="figure-label">{{ f.label }}</div>
                        <div class="figure-value">{{ f.value ?? '—' }}</div>
                    </component>
                </div>
            </div>`,
    };

    const PageHeader = {
        props: { title: String, subtitle: String },
        template: `
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                <div>
                    <h1 class="page-title">{{ title }}</h1>
                    <p v-if="subtitle" class="text-body-secondary mb-0 mt-1">{{ subtitle }}</p>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2"><slot></slot></div>
            </div>`,
    };

    const LoadingBlock = {
        props: { text: { type: String, default: "Loading" } },
        template: `
            <div class="d-flex align-items-center gap-2 text-body-secondary py-4" role="status">
                <span class="spinner-border spinner-border-sm"></span><span>{{ text }}</span>
            </div>`,
    };

    const EmptyState = {
        props: { title: String, text: String },
        template: `
            <div class="empty-state">
                <div class="fw-medium">{{ title }}</div>
                <div v-if="text" class="text-body-secondary small mt-1">{{ text }}</div>
                <div v-if="$slots.default" class="mt-3"><slot></slot></div>
            </div>`,
    };

    const PaginationBar = {
        props: { page: Number, pages: Number, total: Number },
        emits: ["change"],
        computed: {
            numbers() {
                const out = [];
                for (let i = Math.max(1, this.page - 2); i <= Math.min(this.pages, this.page + 2); i++) out.push(i);
                return out;
            },
        },
        template: `
            <nav v-if="pages > 1" class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3" aria-label="Pages">
                <span class="small text-body-secondary"><span class="mono">{{ total }}</span> total</span>
                <ul class="pagination pagination-sm mb-0">
                    <li class="page-item" :class="{ disabled: page <= 1 }">
                        <button class="page-link" @click="$emit('change', page - 1)" :disabled="page <= 1">Previous</button>
                    </li>
                    <li v-for="n in numbers" :key="n" class="page-item" :class="{ active: n === page }">
                        <button class="page-link mono" @click="$emit('change', n)" :aria-current="n === page ? 'page' : null">{{ n }}</button>
                    </li>
                    <li class="page-item" :class="{ disabled: page >= pages }">
                        <button class="page-link" @click="$emit('change', page + 1)" :disabled="page >= pages">Next</button>
                    </li>
                </ul>
            </nav>`,
    };

    // Modal.
    const ModalDialog = {
        props: { title: String, size: { type: String, default: "" } },
        emits: ["close"],
        mounted() {
            document.body.classList.add("modal-open");
            this.onKey = (e) => { if (e.key === "Escape") this.$emit("close"); };
            document.addEventListener("keydown", this.onKey);
            this.$nextTick(() => {
                const first = this.$el.querySelector("input:not([disabled]), select, textarea, .modal-footer .btn:last-child");
                if (first) first.focus();
            });
        },
        unmounted() {
            document.body.classList.remove("modal-open");
            document.removeEventListener("keydown", this.onKey);
        },
        template: `
            <div>
                <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" @mousedown.self="$emit('close')">
                    <div class="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down" :class="size">
                        <div class="modal-content">
                            <div class="modal-header pb-0">
                                <h2 class="modal-title h5">{{ title }}</h2>
                                <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
                            </div>
                            <div class="modal-body"><slot></slot></div>
                            <div v-if="$slots.footer" class="modal-footer pt-0"><slot name="footer"></slot></div>
                        </div>
                    </div>
                </div>
                <div class="modal-backdrop show"></div>
            </div>`,
    };

    const ConfirmHost = {
        computed: { state() { return window.store.confirmState; } },
        methods: { answer(v) { window.store.closeConfirm(v); } },
        template: `
            <modal-dialog v-if="state" :title="state.title" @close="answer(false)">
                <p class="mb-0 text-body-secondary">{{ state.message }}</p>
                <template #footer>
                    <button class="btn btn-quiet" @click="answer(false)">Go back</button>
                    <button class="btn" :class="state.variant === 'danger' ? 'btn-danger' : 'btn-primary'" @click="answer(true)">{{ state.confirmText }}</button>
                </template>
            </modal-dialog>`,
    };

    const ToastHost = {
        computed: { toasts() { return window.store.toasts; } },
        methods: { close(id) { window.store.dismiss(id); } },
        template: `
            <div class="toast-host" aria-live="polite">
                <div v-for="t in toasts" :key="t.id" class="alert d-flex align-items-start gap-2 mb-2 py-2"
                     :class="t.variant === 'danger' ? 'alert-danger' : ''" role="alert">
                    <div class="flex-grow-1">{{ t.message }}</div>
                    <button class="btn-close btn-sm mt-1" aria-label="Dismiss" @click="close(t.id)"></button>
                </div>
            </div>`,
    };

    // Seat strip.
    const SeatStrip = {
        props: {
            total: Number, taken: Number,
            mine: { type: Boolean, default: false },
            done: { type: Boolean, default: false },
            size: { type: String, default: "sm" },
            dark: { type: Boolean, default: false },
            count: { type: Boolean, default: true },
        },
        computed: {
            free() { return Math.max(this.total - this.taken, 0); },
            boxes() {
                const out = [];
                for (let i = 0; i < this.total; i++) {
                    const taken = i < this.taken;
                    out.push(taken && this.mine && i === this.taken - 1 ? "mine" : taken ? "taken" : "");
                }
                return out;
            },
            label() {
                if (this.done) return `${this.taken} went`;
                return this.free === 0 ? "Full" : `${this.free} of ${this.total} free`;
            },
            aria() { return `${this.taken} of ${this.total} seats booked${this.mine ? ", including yours" : ""}`; },
        },
        template: `
            <div class="d-flex flex-column gap-1" :class="{ 'align-items-end': dark }">
                <div v-if="total <= 60" class="seats" :class="['seats-' + size, { 'is-done': done, 'seats-on-dark': dark }]" role="img" :aria-label="aria">
                    <span v-for="(b, i) in boxes" :key="i" class="seat" :class="b"></span>
                </div>
                <div v-else class="seat-meter" role="img" :aria-label="aria"><span :style="{ width: (100 * taken / total) + '%' }"></span></div>
                <span v-if="count" class="seat-count" :class="{ 'text-stop': free === 0 && !done && !dark }">{{ label }}</span>
            </div>`,
    };

    // Navigation.
    const MENUS = {
        admin: [
            { to: "/admin", label: "Overview", exact: true },
            { to: "/admin/treks", label: "Treks" },
            { to: "/admin/staff", label: "Trek staff" },
            { to: "/admin/users", label: "Trekkers" },
            { to: "/admin/bookings", label: "Bookings" },
            { to: "/admin/reports", label: "Reports" },
        ],
        staff: [
            { to: "/staff", label: "Overview", exact: true },
            { to: "/staff/treks", label: "My treks" },
            { to: "/profile", label: "Profile" },
        ],
        user: [
            { to: "/dashboard", label: "Your treks" },
            { to: "/treks", label: "Browse" },
            { to: "/bookings", label: "Bookings" },
            { to: "/history", label: "History" },
            { to: "/profile", label: "Profile" },
        ],
    };

    const NavBar = {
        data() { return { open: false }; },
        computed: {
            store() { return window.store; },
            links() { return MENUS[this.store.role] || []; },
            roleLabel() { return { admin: "Admin", staff: "Trek staff", user: "Trekker" }[this.store.role]; },
        },
        watch: { $route() { this.open = false; } },
        methods: {
            isActive(link) {
                const path = this.$route.path;
                return link.exact ? path === link.to : path === link.to || path.startsWith(link.to + "/");
            },
            async logout() {
                try { await window.api.post("/api/logout"); } catch (e) { /* token may already be invalid */ }
                window.store.endSession();
            },
        },
        template: `
            <nav class="navbar navbar-expand-lg navbar-dark app-navbar sticky-top">
                <div class="container-xl">
                    <router-link class="navbar-brand d-flex align-items-center gap-2" :to="store.homeFor(store.role)">
                        <img class="brand-mark" src="/static/assets/mark-white.png" alt="" width="29" height="32"><span>Summit Lovers</span>
                    </router-link>
                    <button class="navbar-toggler border-0" type="button" @click="open = !open"
                            :aria-expanded="open ? 'true' : 'false'" aria-controls="main-nav" aria-label="Menu">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div id="main-nav" class="collapse navbar-collapse" :class="{ show: open }">
                        <ul class="navbar-nav me-auto gap-lg-1">
                            <li v-for="link in links" :key="link.to" class="nav-item">
                                <router-link class="nav-link" :class="{ active: isActive(link) }" :to="link.to"
                                             :aria-current="isActive(link) ? 'page' : null">{{ link.label }}</router-link>
                            </li>
                        </ul>
                        <div class="d-flex align-items-center gap-3 py-2 py-lg-0">
                            <div class="nav-user">{{ store.user && store.user.name }}<small>{{ roleLabel }}</small></div>
                            <button class="btn btn-sm btn-outline-light" @click="logout">Log out</button>
                        </div>
                    </div>
                </div>
            </nav>`,
    };

    const AppRoot = {
        computed: { isPublic() { return !!this.$route.meta.public; } },
        template: `
            <div class="app-root">
                <router-view v-if="isPublic"></router-view>
                <template v-else>
                    <nav-bar></nav-bar>
                    <main class="container-xl py-4 py-lg-5"><router-view></router-view></main>
                </template>
                <toast-host></toast-host>
                <confirm-host></confirm-host>
            </div>`,
    };

    // Trek pieces.
    function contourPaths(seedText) {
        let h = 0;
        for (const ch of seedText || "trek") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const cx = 120 + (h % 160), cy = 70 + ((h >> 8) % 90), phase = (h % 628) / 100;
        const paths = [];
        for (let k = 1; k <= 8; k++) {
            const r = 14 + k * 20;
            let d = "";
            for (let i = 0; i <= 48; i++) {
                const a = (i / 48) * Math.PI * 2;
                const wobble = 1 + 0.14 * Math.sin(3 * a + phase + k * 0.3) + 0.07 * Math.sin(5 * a - phase);
                const x = cx + Math.cos(a) * r * 1.35 * wobble;
                const y = cy + Math.sin(a) * r * 0.8 * wobble;
                d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
            }
            paths.push(d + "Z");
        }
        return paths;
    }
    window.contourPaths = contourPaths; // also used by the login slideshow

    const TrekImage = {
        props: { src: String, alt: String, place: String, height: { type: Number, default: 168 } },
        data() { return { failed: false }; },
        watch: { src() { this.failed = false; } },
        computed: {
            real() { return this.src && !this.src.includes("trek-placeholder") && !this.failed; },
            paths() { return contourPaths(this.alt); },
        },
        template: `
            <img v-if="real" :src="src" :alt="alt" class="trek-img" :style="{ height: height + 'px' }" loading="lazy" @error="failed = true">
            <div v-else class="trek-img trek-img-blank" :style="{ height: height + 'px' }" role="img" :aria-label="'Map of ' + (place || alt)">
                <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <path v-for="(d, i) in paths" :key="i" :d="d" fill="none"
                          :stroke="i === 0 ? 'rgba(31,95,69,0.55)' : 'rgba(23,32,28,0.16)'" stroke-width="1"></path>
                </svg>
                <span class="place">{{ place }}</span>
            </div>`,
    };

    const TrekCard = {
        props: { trek: Object, bookedIds: { type: Object, default: () => new Set() } },
        computed: { booked() { return this.bookedIds.has(this.trek.id); } },
        template: `
            <article class="card trek-card h-100">
                <trek-image :src="trek.image_url" :alt="trek.name" :place="trek.location"></trek-image>
                <div class="card-body d-flex flex-column gap-3">
                    <div>
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <h3 class="h6 mb-1">
                                <router-link :to="'/treks/' + trek.id" class="stretched-link text-reset text-decoration-none">{{ trek.name }}</router-link>
                            </h3>
                            <span v-if="booked" class="tag tag-go">Booked</span>
                            <status-badge v-else-if="trek.status !== 'Open'" :status="trek.status"></status-badge>
                        </div>
                        <div class="small text-body-secondary">{{ trek.location }} · {{ $fmt.days(trek.duration_days) }} · {{ trek.difficulty }}</div>
                    </div>
                    <div class="mt-auto d-flex align-items-end justify-content-between gap-3">
                        <div>
                            <div class="mono text-body-secondary mb-2">{{ $fmt.range(trek.start_date, trek.end_date) }}</div>
                            <seat-strip :total="trek.total_slots" :taken="trek.booked_count" :mine="booked"></seat-strip>
                        </div>
                        <div class="mono fw-medium">{{ $fmt.money(trek.price) }}</div>
                    </div>
                </div>
            </article>`,
    };

    // CSV export: the file is emailed to the user, there is no download on the page.
    const ExportButton = {
        props: { label: { type: String, default: "Email my booking history (CSV)" } },
        data() { return { working: false, taskId: null, timer: null }; },
        unmounted() { clearTimeout(this.timer); },
        methods: {
            async start() {
                this.working = true;
                try {
                    const res = await window.api.post("/api/export");
                    this.taskId = res.data.task_id;
                    this.poll();
                } catch (e) {
                    this.working = false;
                    window.store.toast(e.message, "danger");
                }
            },
            async poll() {
                try {
                    const res = await window.api.get("/api/export/" + this.taskId);
                    const s = res.data.state;
                    if (s === "SUCCESS") {
                        this.working = false;
                        if (res.data.emailed) window.store.toast("Your booking history CSV has been emailed to you.");
                        else window.store.toast("The CSV was created but the email could not be sent. Try again later.", "danger");
                        return;
                    }
                    if (s === "FAILURE") {
                        this.working = false;
                        window.store.toast("The export failed. Try again.", "danger");
                        return;
                    }
                    this.timer = setTimeout(this.poll, 2000);
                } catch (e) {
                    this.working = false;
                    window.store.toast(e.message, "danger");
                }
            },
        },
        template: `
            <button class="btn btn-quiet" :disabled="working" @click="start">
                <span v-if="working" class="spinner-border spinner-border-sm me-1"></span>
                {{ working ? 'Preparing CSV' : label }}
            </button>`,
    };

    window.CommonComponents = {
        StatusBadge, FigureRow, PageHeader, LoadingBlock, EmptyState, PaginationBar, ModalDialog,
        ConfirmHost, ToastHost, SeatStrip, NavBar, AppRoot, TrekImage, TrekCard, ExportButton,
    };
})();
