// Session and UI state.
(function () {
    const KEY = "tma_session";

    function readSaved() {
        for (const storage of [localStorage, sessionStorage]) {
            try {
                const raw = storage.getItem(KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { /* storage blocked or corrupt: treat as logged out */ }
        }
        return { token: null, user: null };
    }

    function clearSaved() {
        for (const storage of [localStorage, sessionStorage]) {
            try { storage.removeItem(KEY); } catch (e) { /* ignore */ }
        }
    }

    const saved = readSaved();
    let toastId = 0;

    const store = Vue.reactive({
        token: saved.token,
        user: saved.user,
        remember: !!saved.remember,
        toasts: [],
        confirmState: null,

        get role() { return this.user ? this.user.role : null; },
        get loggedIn() { return !!this.token; },

        startSession(token, user, remember) {
            clearSaved();
            this.token = token;
            this.user = user;
            this.remember = !!remember;
            const storage = remember ? localStorage : sessionStorage;
            try { storage.setItem(KEY, JSON.stringify({ token, user, remember: !!remember })); } catch (e) { /* ignore */ }
        },

        updateUser(user) {
            this.user = user;
            const storage = this.remember ? localStorage : sessionStorage;
            try { storage.setItem(KEY, JSON.stringify({ token: this.token, user, remember: this.remember })); } catch (e) { /* ignore */ }
        },

        endSession(reason) {
            clearSaved();
            this.token = null;
            this.user = null;
            if (reason) this.toast(reason, "danger");
            if (window.router) window.router.replace("/login");
        },

        toast(message, variant = "success") {
            const id = ++toastId;
            this.toasts.push({ id, message, variant });
            setTimeout(() => this.dismiss(id), variant === "danger" ? 7000 : 4000);
        },

        dismiss(id) {
            this.toasts = this.toasts.filter((t) => t.id !== id);
        },

        // Wait for confirmation.
        confirm({ title = "Are you sure?", message = "", confirmText = "Confirm", variant = "danger" } = {}) {
            return new Promise((resolve) => {
                this.confirmState = { title, message, confirmText, variant, resolve };
            });
        },

        closeConfirm(answer) {
            if (this.confirmState) this.confirmState.resolve(answer);
            this.confirmState = null;
        },
    });

    store.homeFor = function (role) {
        return { admin: "/admin", staff: "/staff", user: "/dashboard" }[role] || "/login";
    };

    window.store = store;
})();
