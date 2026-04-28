const dhisDevConfig = DHIS_CONFIG;
const isDev = "baseUrl" in dhisDevConfig;
// Same-origin in dev: requests go through the webpack-dev-server proxy,
// which injects Authorization. "../../.." in production: app served at
// /api/apps/{name}/index.html resolves against the DHIS2 root.
const baseUrl = isDev ? "" : "../../..";

const getHeaders = () => new Headers();

// Helper function to standardize endpoint format
const formatEndpoint = (endpoint) => {
    // Remove any leading slashes
    if (endpoint.startsWith("/")) {
        endpoint = endpoint.slice(1);
    }

    // Remove any leading 'api/'
    if (endpoint.startsWith("api/")) {
        endpoint = endpoint.slice(4);
    }

    // Ensure the final format is /api/...
    return `/api/${endpoint}`;
};

// Helper function to validate endpoint UID (11 characters, alphanumeric)
const validateUID = (endpoint) => {
    const uid = endpoint.split("/").pop().split("?")[0];
    return /^[A-Za-z0-9]{11}$/.test(uid);
};


// Helper function to handle API errors and throw detailed error messages
const handleApiError = async (response) => {
    let errorMessage = "Network response was not ok";
    let errorDetail = await response.json(); // Capture the error response body text

    errorMessage = errorDetail.message || errorMessage;

    throw new Error(`${response.statusText} - ${errorMessage}`);
};

// GET from API async
export const d2Get = async (endpoint, { signal } = {}) => {
    try {
        endpoint = formatEndpoint(endpoint);
        let headers = getHeaders();
        let response = await fetch(baseUrl + endpoint, {
            method: "GET",
            headers: headers,
            signal,
        });
        if (!response.ok) {
            await handleApiError(response); // Handle the error response
        }
        let data = await response.json();
        return data;
    } catch (error) {
        if (error.name === "AbortError") throw error;
        console.log("ERROR in GET:");
        console.log(error);
        throw error;
    }
};

// POST to API async
export const d2PostJson = async (endpoint, body, { signal } = {}) => {
    endpoint = formatEndpoint(endpoint);
    let headers = getHeaders();
    headers.set("Content-Type", "application/json");

    const response = await fetch(baseUrl + endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        signal,
    });

    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        console.warn("Response is not JSON, ignoring:", e);
    }

    return {
        httpStatusCode: response.status,
        httpStatus: response.statusText,
        ok: response.ok,
        ...data
    };
};

// POST with text/plain to API async
export const d2PostPlain = async (endpoint, body, { signal } = {}) => {
    endpoint = formatEndpoint(endpoint);
    let headers = getHeaders();
    headers.set("Content-Type", "text/plain");

    let response;
    let data = {};

    try {
        response = await fetch(baseUrl + endpoint, {
            method: "POST",
            headers: headers,
            body: body,
            signal,
        });

        try {
            data = await response.json();
        } catch (e) {
            console.warn("Response is not JSON, ignoring:", e);
        }

        return {
            httpStatusCode: response.status,
            httpStatus: response.statusText,
            ok: response.ok,
            ...data
        };
    } catch (error) {
        if (error.name === "AbortError") throw error;
        console.error("ERROR in POST PLAIN:", error);
        return {
            httpStatusCode: 0,
            httpStatus: "Network error",
            ok: false,
            message: "Network or fetch error occurred",
            error: error.message || error
        };
    }
};


// PUT to API async
export const d2PutJson = async (endpoint, body, { signal } = {}) => {
    try {
        endpoint = formatEndpoint(endpoint);

        if (!validateUID(endpoint)) {
            console.warn("Warning: The endpoint does not end with a valid 11-character UID");
        }

        let headers = getHeaders();
        headers.set("Content-Type", "application/json");
        let response = await fetch(baseUrl + endpoint, {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(body),
            signal,
        });
        if (!response.ok) {
            await handleApiError(response); // Handle the error response
        }
        let data = await response.json();
        return data;
    } catch (error) {
        if (error.name === "AbortError") throw error;
        console.log("ERROR in PUT:");
        console.log(error);
        throw error;
    }
};

// DELETE from API async
export const d2Delete = async (endpoint, { signal } = {}) => {
    try {
        endpoint = formatEndpoint(endpoint);

        if (!validateUID(endpoint)) {
            console.warn("Warning: The endpoint does not end with a valid 11-character UID");
        }

        let headers = getHeaders();
        let response = await fetch(baseUrl + endpoint, {
            method: "DELETE",
            headers: headers,
            signal,
        });
        if (!response.ok) {
            await handleApiError(response); // Handle the error response
        }
        return { status: "success" };
    } catch (error) {
        if (error.name === "AbortError") throw error;
        console.log("ERROR in DELETE:");
        console.log(error);
        throw error;
    }
};
