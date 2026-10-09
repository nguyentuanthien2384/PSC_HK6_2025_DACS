jest.mock("axios", () => {
    const client = { interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
    return { create: jest.fn(() => client) };
});

import client, { API_BASE_URL } from "./axios";
import { setAuth } from "./utils/token";

const request = client.interceptors.request.use.mock.calls[0][0];
const success = client.interceptors.response.use.mock.calls[0][0];
const failure = client.interceptors.response.use.mock.calls[0][1];
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/login"); });

test("request interceptor reads token added after importing the API client", () => {
    expect(request({ url: "/api/me", headers: {} }).headers.authorization).toBeUndefined();
    setAuth("token1", { id: 1 });
    expect(request({ url: "/api/me", headers: {} }).headers.authorization).toBe("Bearer token1");
    setAuth("token2", { id: 1 });
    expect(request({ url: "/api/me", headers: {} }).headers.authorization).toBe("Bearer token2");
});

test("third party requests never receive the backend bearer token", () => {
    setAuth("private", { id: 1 });
    expect(request({ url: "https://tygia.com/json.php", baseURL: API_BASE_URL, headers: { Authorization: "Bearer private" } }).headers).toEqual({});
});

test("unwraps backend response envelope", () => expect(success({ data: { errCode: 0 } })).toEqual({ errCode: 0 }));

test.each([401, 403])("only unauthenticated responses expire the session (status %i)", async (status) => {
    setAuth("private", { id: 1 });
    const error = { response: { status, data: { errMessage: "Denied" } } };
    await expect(failure(error)).rejects.toMatchObject({ message: "Denied" });
    expect(localStorage.getItem("token") === null).toBe(status === 401);
});

test("preserves existing refresh flag logout behavior", async () => {
    setAuth("private", { id: 1 });
    await expect(failure({ response: { status: 400, data: { refresh: true } } })).rejects.toBeDefined();
    expect(localStorage.getItem("token")).toBeNull();
});
