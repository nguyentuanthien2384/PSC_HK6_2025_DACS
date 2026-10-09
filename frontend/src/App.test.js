import React from "react";
import { render, screen } from "@testing-library/react";
import { setAuth } from "./utils/token";
import RequireAuth from "./component/RequireAuth";
jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div data-testid="redirect">{to}</div>,
  useLocation: () => ({ pathname: "/order/9", search: "?step=1" }),
  useParams: () => ({ userId: "9" }),
}), { virtual: true });

beforeEach(() => localStorage.clear());
test("private routes preserve the destination when login is required", () => {
  render(<RequireAuth><div>checkout</div></RequireAuth>);
  expect(screen.getByTestId("redirect")).toHaveTextContent("/login?redirect=%2Forder%2F9%3Fstep%3D1");
});
test("checkout routes redirect a forged URL user id to the account's own checkout", () => {
  setAuth("jwt", { id: 4, roleId: "R2" });
  render(<RequireAuth owner><div>checkout</div></RequireAuth>);
  expect(screen.getByTestId("redirect")).toHaveTextContent("/order/4");
});
test("admin shell refuses a customer role", () => {
  setAuth("jwt", { id: 9, roleId: "R2" });
  render(<RequireAuth roles={["R1", "R4"]}><div>admin</div></RequireAuth>);
  expect(screen.queryByText("admin")).not.toBeInTheDocument();
  expect(screen.getByTestId("redirect")).toHaveTextContent("/");
});
test("authorized private routes render their content", () => {
  setAuth("jwt", { id: 9, roleId: "R2" });
  render(<RequireAuth owner><div>checkout</div></RequireAuth>);
  expect(screen.getByText("checkout")).toBeInTheDocument();
});