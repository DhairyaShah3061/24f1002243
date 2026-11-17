// Send API requests.
(function () {
    async function request(method, url, body) {
        const headers = { Accept: "application/json" };
        const token = window.store ? window.store.token : null;
        if (token) headers.Authorization = "Bearer " + token;
        if (body !== undefined) headers["Content-Type"] = "application/json";

        let response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (networkError) {
            throw new Error("Cannot reach the server. Is Flask running?");
        }

        let payload = null;
        const type = response.headers.get("Content-Type") || "";
        if (type.includes("application/json")) payload = await response.json();

        if (!response.ok) {
            const message = (payload && payload.error) || `Request failed (${response.status}).`;
            // Return to login when the session ends.
            const blocked = payload && payload.code === "ACCOUNT_BLOCKED";
            if ((response.status === 401 && token) || blocked) {
                window.store.endSession(message);
            }
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        return payload || {};
    }

    window.api = {
        get: (url) => request("GET", url),
        post: (url, body = {}) => request("POST", url, body),
        put: (url, body = {}) => request("PUT", url, body),
        del: (url) => request("DELETE", url),
    };
})();
