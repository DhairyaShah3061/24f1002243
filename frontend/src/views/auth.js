// Login, register and trek slideshow.
(function () {
    const SLIDE_MS = 5000;

    const Doorway = {
        data() {
            return {
                treks: null,
                index: 0,
                holding: false,    // mouse (or keyboard focus) is on the slideshow
                failed: {},        // trek id -> true when its photo didn't load
            };
        },
        async created() {
            try {
                const res = await window.api.get("/api/treks?per_page=8");
                this.treks = res.data.items;
            } catch (e) {
                this.treks = [];
            }
            this.timer = setInterval(this.tick, SLIDE_MS);
            this.onVisibility = () => { this.hidden = document.hidden; };
            document.addEventListener("visibilitychange", this.onVisibility);
        },
        unmounted() {
            clearInterval(this.timer);
            document.removeEventListener("visibilitychange", this.onVisibility);
        },
        computed: {
            current() { return this.treks && this.treks[this.index]; },
            // Keep the slide text short.
            oneLiner() {
                const text = (this.current && this.current.description) || "";
                const first = text.split("\n")[0].match(/^.*?[.!?](\s|$)/);
                return (first ? first[0] : text.split("\n")[0]).trim();
            },
        },
        methods: {
            tick() {
                if (this.holding || this.hidden || !this.treks || this.treks.length < 2) return;
                this.index = (this.index + 1) % this.treks.length;
            },
            go(i) {
                this.index = (i + this.treks.length) % this.treks.length;
                // Reset the slide timer.
                clearInterval(this.timer);
                this.timer = setInterval(this.tick, SLIDE_MS);
            },
            hasPhoto(t) {
                return t.image_url && !t.image_url.includes("trek-placeholder") && !this.failed[t.id];
            },
            paths(t) { return window.contourPaths(t.name); },
        },
        template: `
            <div class="doorway">
                <section class="showcase" aria-roledescription="carousel" aria-label="Next departures"
                         @mouseenter="holding = true" @mouseleave="holding = false"
                         @focusin="holding = true" @focusout="holding = false">
                    <div class="showcase-brand"><img src="/static/assets/logo-white.png" alt="Summit Lovers" width="76" height="120"></div>

                    <template v-if="treks && treks.length">
                        <div v-for="(t, i) in treks" :key="t.id" class="slide" :class="{ active: i === index }"
                             role="group" aria-roledescription="slide" :aria-label="(i + 1) + ' of ' + treks.length + ': ' + t.name"
                             :aria-hidden="i !== index">
                            <img v-if="hasPhoto(t)" :src="t.image_url" alt="" @error="failed[t.id] = true">
                            <svg v-else class="slide-map" viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                                <path v-for="(d, k) in paths(t)" :key="k" :d="d" fill="none"
                                      :stroke="k === 0 ? 'rgba(126,196,160,0.7)' : 'rgba(255,255,255,0.14)'" stroke-width="0.8"></path>
                            </svg>
                        </div>

                        <div class="slide-caption">
                            <h2 class="slide-name">{{ current.name }}</h2>
                            <div class="slide-meta">{{ current.location }} · {{ current.difficulty }} · {{ $fmt.days(current.duration_days) }}</div>
                            <p v-if="oneLiner" class="slide-desc">{{ oneLiner }}</p>
                            <div class="slide-controls">
                                <button type="button" class="slide-btn" @click="go(index - 1)" aria-label="Previous trek">‹</button>
                                <div class="slide-dots">
                                    <button v-for="(t, i) in treks" :key="t.id" type="button" class="slide-dot" :class="{ active: i === index }"
                                            :aria-label="'Show ' + t.name" :aria-current="i === index ? 'true' : null" @click="go(i)"></button>
                                </div>
                                <button type="button" class="slide-btn" @click="go(index + 1)" aria-label="Next trek">›</button>
                            </div>
                        </div>
                    </template>
                    <div v-else-if="treks" class="slide-caption">
                        <h2 class="slide-name">No treks are scheduled right now</h2>
                    </div>
                </section>
                <div class="doorway-form"><div><img class="doorway-logo" src="/static/assets/logo-black.png" alt="Summit Lovers" width="61" height="96"><slot></slot></div></div>
            </div>`,
    };

    const LoginView = {
        components: { Doorway },
        data() {
            return {
                form: { email: this.$route.query.email || "", password: "", remember_me: false },
                error: "",
                busy: false,
            };
        },
        methods: {
            async submit(event) {
                if (!event.target.checkValidity()) {
                    event.target.classList.add("was-validated");
                    return;
                }
                this.error = "";
                this.busy = true;
                try {
                    const res = await window.api.post("/api/login", this.form);
                    const { token, user } = res.data;
                    window.store.startSession(token, user, this.form.remember_me);
                    const next = this.$route.query.next;
                    this.$router.replace(next && next.startsWith("/") ? next : window.store.homeFor(user.role));
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.busy = false;
                }
            },
        },
        template: `
            <doorway>
                <h1 class="h3 mb-4">Log in</h1>
                <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
                <form novalidate @submit.prevent="submit">
                    <div class="mb-3">
                        <label for="login-email" class="form-label">Email</label>
                        <input id="login-email" v-model.trim="form.email" type="email" class="form-control" autocomplete="username" required>
                        <div class="invalid-feedback">Enter the email you registered with</div>
                    </div>
                    <div class="mb-3">
                        <label for="login-password" class="form-label">Password</label>
                        <input id="login-password" v-model="form.password" type="password" class="form-control" autocomplete="current-password" required>
                        <div class="invalid-feedback">Enter your password</div>
                    </div>
                    <div class="form-check mb-4">
                        <input id="login-remember" v-model="form.remember_me" class="form-check-input" type="checkbox">
                        <label for="login-remember" class="form-check-label small">Keep me logged in for 30 days</label>
                    </div>
                    <button class="btn btn-primary w-100" :disabled="busy">
                        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>Log in
                    </button>
                </form>
                <p class="small text-body-secondary mt-4 mb-0">
                    New trekker? <router-link to="/register">Create an account</router-link>.
                    Staff accounts are created by the admin.
                </p>
            </doorway>`,
    };

    const RegisterView = {
        components: { Doorway },
        data() {
            return {
                form: { name: "", email: "", phone: "", password: "", confirm_password: "" },
                error: "",
                busy: false,
            };
        },
        computed: {
            mismatch() {
                return this.form.confirm_password.length > 0 && this.form.password !== this.form.confirm_password;
            },
        },
        methods: {
            async submit(event) {
                const confirm = event.target.querySelector("#reg-confirm");
                confirm.setCustomValidity(this.mismatch ? "Passwords do not match" : "");
                if (!event.target.checkValidity()) {
                    event.target.classList.add("was-validated");
                    return;
                }
                this.error = "";
                this.busy = true;
                try {
                    await window.api.post("/api/register", this.form);
                    window.store.toast("Account created. Log in to book.");
                    this.$router.replace({ path: "/login", query: { email: this.form.email } });
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.busy = false;
                }
            },
        },
        template: `
            <doorway>
                <h1 class="h3 mb-4">Create a trekker account</h1>
                <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
                <form novalidate @submit.prevent="submit">
                    <div class="mb-3">
                        <label for="reg-name" class="form-label">Full name</label>
                        <input id="reg-name" v-model.trim="form.name" class="form-control" autocomplete="name" maxlength="100" required>
                        <div class="invalid-feedback">Enter your name</div>
                    </div>
                    <div class="mb-3">
                        <label for="reg-email" class="form-label">Email</label>
                        <input id="reg-email" v-model.trim="form.email" type="email" class="form-control" autocomplete="email" maxlength="120" required>
                        <div class="invalid-feedback">Enter a valid email address</div>
                    </div>
                    <div class="mb-3">
                        <label for="reg-phone" class="form-label">Phone (optional)</label>
                        <input id="reg-phone" v-model.trim="form.phone" type="tel" class="form-control" autocomplete="tel" pattern="\\+?[0-9 \\-]{7,15}">
                        <div class="invalid-feedback">Use 7–15 digits</div>
                    </div>
                    <div class="row g-3 mb-4">
                        <div class="col-sm-6">
                            <label for="reg-password" class="form-label">Password</label>
                            <input id="reg-password" v-model="form.password" type="password" class="form-control" autocomplete="new-password" minlength="6" required>
                            <div class="invalid-feedback">At least 6 characters</div>
                        </div>
                        <div class="col-sm-6">
                            <label for="reg-confirm" class="form-label">Confirm password</label>
                            <input id="reg-confirm" v-model="form.confirm_password" type="password" class="form-control"
                                   :class="{ 'is-invalid': mismatch }" autocomplete="new-password" required>
                            <div class="invalid-feedback">Passwords must match</div>
                        </div>
                    </div>
                    <button class="btn btn-primary w-100" :disabled="busy">
                        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>Create account
                    </button>
                </form>
                <p class="small text-body-secondary mt-4 mb-0">Already registered? <router-link to="/login">Log in</router-link></p>
            </doorway>`,
    };

    window.AuthViews = { LoginView, RegisterView };
})();
