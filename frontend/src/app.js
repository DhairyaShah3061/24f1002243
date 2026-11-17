// Start Vue.
(function () {
    const app = Vue.createApp(window.CommonComponents.AppRoot);

    // Register shared components.
    Object.entries(window.CommonComponents).forEach(([name, component]) => {
        const tag = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
        app.component(tag, component);
    });

    app.config.globalProperties.$fmt = window.fmt;
    app.config.errorHandler = (err) => {
        console.error(err);
        window.store.toast("Something went wrong on this page. Try reloading.", "danger");
    };

    app.use(window.router);
    app.mount("#app");

    // Register the service worker.
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/sw.js").catch(() => { /* optional feature */ });
        });
    }
})();
