import { clearAuth, getToken, getUser, setAuth } from "./token";

beforeEach(() => localStorage.clear());

test("reads legacy raw tokens and JSON tokens after login", () => {
    localStorage.setItem("token", "legacy.jwt.token");
    expect(getToken()).toBe("legacy.jwt.token");
    setAuth("new.jwt.token", { id: 12, roleId: "R2" });
    expect(getToken()).toBe("new.jwt.token");
    expect(getUser().id).toBe(12);
});

test("malformed session storage never crashes route rendering", () => {
    localStorage.setItem("userData", "broken");
    localStorage.setItem("token", "undefined");
    expect(getUser()).toBeNull();
    expect(getToken()).toBeNull();
});

test("logout clears account data and cached checkout", () => {
    setAuth("jwt", { id: 1 });
    localStorage.setItem("persist:shopcart", "cached cart");
    localStorage.setItem("orderData", "pending order");
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(localStorage.getItem("persist:shopcart")).toBeNull();
    expect(localStorage.getItem("orderData")).toBeNull();
});
