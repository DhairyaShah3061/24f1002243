// Routes and role guard.
(function () {
    const A = window.AdminViews, S = window.StaffViews, U = window.UserViews;
    const any = ["admin", "staff", "user"];

    const routes = [
        { path: "/", redirect: () => (window.store.loggedIn ? window.store.homeFor(window.store.role) : "/login") },
        { path: "/login", component: window.AuthViews.LoginView, meta: { public: true, title: "Log in" } },
        { path: "/register", component: window.AuthViews.RegisterView, meta: { public: true, title: "Register" } },

        { path: "/admin", component: A.AdminDashboard, meta: { roles: ["admin"], title: "Overview" } },
        { path: "/admin/treks", component: A.AdminTreks, meta: { roles: ["admin"], title: "Treks" } },
        { path: "/admin/staff", component: A.AdminStaff, meta: { roles: ["admin"], title: "Trek staff" } },
        { path: "/admin/users", component: A.AdminUsers, meta: { roles: ["admin"], title: "Trekkers" } },
        { path: "/admin/bookings", component: A.AdminBookings, meta: { roles: ["admin"], title: "Bookings" } },
        { path: "/admin/reports", component: A.AdminReports, meta: { roles: ["admin"], title: "Reports" } },

        { path: "/staff", component: S.StaffDashboard, meta: { roles: ["staff"], title: "Overview" } },
        { path: "/staff/treks", component: S.StaffTreks, meta: { roles: ["staff"], title: "My treks" } },
        { path: "/staff/treks/:id(\\d+)", component: S.StaffTrekManage, meta: { roles: ["staff"], title: "Manage trek" } },

        { path: "/dashboard", component: U.UserDashboard, meta: { roles: ["user"], title: "Your treks" } },
        { path: "/treks", component: U.TrekBrowse, meta: { roles: ["user"], title: "Treks" } },
        { path: "/treks/:id(\\d+)", component: U.TrekDetail, meta: { roles: ["user"], title: "Trek" } },
        { path: "/bookings", component: U.MyBookings, meta: { roles: ["user"], title: "Bookings" } },
        { path: "/history", component: U.HistoryView, meta: { roles: ["user"], title: "History" } },

        { path: "/profile", component: window.ProfileViews.ProfileView, meta: { roles: any, title: "Profile" } },
        { path: "/:pathMatch(.*)*", redirect: "/" },
    ];

    const router = VueRouter.createRouter({
        history: VueRouter.createWebHashHistory(),
        routes,
        scrollBehavior: () => ({ top: 0 }),
    });

    router.beforeEach((to) => {
        const store = window.store;
        if (to.meta.public) {
            // Skip auth pages when logged in.
            return store.loggedIn ? store.homeFor(store.role) : true;
        }
        if (!store.loggedIn) {
            return { path: "/login", query: to.fullPath !== "/" ? { next: to.fullPath } : {} };
        }
        if (to.meta.roles && !to.meta.roles.includes(store.role)) {
            return store.homeFor(store.role);
        }
        return true;
    });

    router.afterEach((to) => {
        document.title = (to.meta.title ? to.meta.title + " · " : "") + "Summit Lovers";
    });

    window.router = router;
})();
