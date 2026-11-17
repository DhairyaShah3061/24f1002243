// Profile page.
(function () {
    const ProfileView = {
        data() {
            return { profile: null, form: null, password: { current_password: "", new_password: "", confirm_password: "" }, error: "", busy: false };
        },
        computed: {
            isStaff() { return this.profile && this.profile.role === "staff"; },
            roleLabel() { return { admin: "Admin", staff: "Trek staff", user: "Trekker" }[this.profile.role]; },
            mismatch() {
                return this.password.confirm_password.length > 0 && this.password.new_password !== this.password.confirm_password;
            },
        },
        async created() {
            try {
                const res = await window.api.get("/api/profile");
                this.load(res.data);
            } catch (e) {
                this.error = e.message;
            }
        },
        methods: {
            load(user) {
                this.profile = user;
                const sp = user.staff_profile || {};
                this.form = {
                    name: user.name,
                    phone: user.phone || "",
                    contact: sp.contact || "",
                    specialization: sp.specialization || "",
                    experience_years: sp.experience_years ?? 0,
                };
            },
            async save(event) {
                const confirm = event.target.querySelector("#pf-confirm");
                if (confirm) confirm.setCustomValidity(this.mismatch ? "Passwords do not match." : "");
                if (!event.target.checkValidity()) {
                    event.target.classList.add("was-validated");
                    return;
                }
                this.error = "";
                this.busy = true;
                try {
                    const body = { ...this.form };
                    if (this.password.new_password) Object.assign(body, this.password);
                    const res = await window.api.put("/api/profile", body);
                    this.load(res.data);
                    window.store.updateUser(res.data);
                    this.password = { current_password: "", new_password: "", confirm_password: "" };
                    event.target.classList.remove("was-validated");
                    window.store.toast(res.message || "Profile saved.");
                } catch (e) {
                    this.error = e.message;
                } finally {
                    this.busy = false;
                }
            },
        },
        template: `
            <div>
                <page-header title="Profile"></page-header>
                <loading-block v-if="!profile && !error"></loading-block>
                <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

                <div v-if="profile" class="row g-4">
                    <div class="col-lg-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="avatar mb-3" aria-hidden="true">{{ profile.name.charAt(0).toUpperCase() }}</div>
                                <div class="fw-medium">{{ profile.name }}</div>
                                <div class="text-body-secondary small mb-3">{{ profile.email }}</div>
                                <dl class="row small mb-0">
                                    <dt class="col-5 fw-normal text-body-secondary">Role</dt><dd class="col-7">{{ roleLabel }}</dd>
                                    <template v-if="isStaff">
                                        <dt class="col-5 fw-normal text-body-secondary">Staff ID</dt><dd class="col-7">{{ profile.staff_profile.code }}</dd>
                                    </template>
                                    <dt class="col-5 fw-normal text-body-secondary">Member since</dt><dd class="col-7 mb-0">{{ $fmt.date(profile.created_at) }}</dd>
                                </dl>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-8">
                        <form class="card" novalidate @submit.prevent="save">
                            <div class="card-body">
                                <h2 class="h6 mb-3">Details</h2>
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label for="pf-name" class="form-label">Full name</label>
                                        <input id="pf-name" v-model.trim="form.name" class="form-control" maxlength="100" required>
                                        <div class="invalid-feedback">Name is required</div>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="pf-email" class="form-label">Email</label>
                                        <input id="pf-email" :value="profile.email" class="form-control" disabled>
                                        <div class="form-text">Email is your login and cannot be changed.</div>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="pf-phone" class="form-label">Phone</label>
                                        <input id="pf-phone" v-model.trim="form.phone" type="tel" class="form-control" pattern="\\+?[0-9 \\-]{7,15}">
                                        <div class="invalid-feedback">Use 7–15 digits</div>
                                    </div>
                                    <template v-if="isStaff">
                                        <div class="col-md-6">
                                            <label for="pf-contact" class="form-label">Field contact number</label>
                                            <input id="pf-contact" v-model.trim="form.contact" type="tel" class="form-control" pattern="\\+?[0-9 \\-]{7,15}">
                                            <div class="invalid-feedback">Use 7–15 digits</div>
                                        </div>
                                        <div class="col-md-8">
                                            <label for="pf-spec" class="form-label">Specialization</label>
                                            <input id="pf-spec" v-model.trim="form.specialization" class="form-control" maxlength="120"
                                                   placeholder="e.g. High-altitude, first aid">
                                        </div>
                                        <div class="col-md-4">
                                            <label for="pf-exp" class="form-label">Experience (years)</label>
                                            <input id="pf-exp" v-model.number="form.experience_years" type="number" min="0" max="60" class="form-control" required>
                                            <div class="invalid-feedback">0 to 60</div>
                                        </div>
                                    </template>
                                </div>

                                <h2 class="h6 mt-4 mb-1">Change password</h2>
                                <p class="small text-body-secondary">Leave blank to keep your current password.</p>
                                <div class="row g-3">
                                    <div class="col-md-4">
                                        <label for="pf-current" class="form-label">Current password</label>
                                        <input id="pf-current" v-model="password.current_password" type="password" class="form-control"
                                               autocomplete="current-password" :required="!!password.new_password">
                                        <div class="invalid-feedback">Needed to set a new password</div>
                                    </div>
                                    <div class="col-md-4">
                                        <label for="pf-new" class="form-label">New password</label>
                                        <input id="pf-new" v-model="password.new_password" type="password" class="form-control"
                                               autocomplete="new-password" minlength="6">
                                        <div class="invalid-feedback">At least 6 characters</div>
                                    </div>
                                    <div class="col-md-4">
                                        <label for="pf-confirm" class="form-label">Confirm new password</label>
                                        <input id="pf-confirm" v-model="password.confirm_password" type="password" class="form-control"
                                               :class="{ 'is-invalid': mismatch }" autocomplete="new-password">
                                        <div class="invalid-feedback">Passwords must match</div>
                                    </div>
                                </div>
                            </div>
                            <div class="card-footer text-end">
                                <button class="btn btn-primary" :disabled="busy">
                                    <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>Save changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`,
    };

    window.ProfileViews = { ProfileView };
})();
