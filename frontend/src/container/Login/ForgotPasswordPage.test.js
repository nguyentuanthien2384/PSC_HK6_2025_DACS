import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { sendForgotPasswordEmail, resetPassword } from "../../services/userService";
let mockQuery = "";
jest.mock("react-router-dom", () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useSearchParams: () => [new URLSearchParams(mockQuery)],
}), { virtual: true });
jest.mock("../../services/userService", () => ({ sendForgotPasswordEmail: jest.fn(), resetPassword: jest.fn() }));
beforeEach(() => { mockQuery = ""; jest.clearAllMocks(); });
test("forgot password submits account email and shows the neutral delivery message", async () => {
  sendForgotPasswordEmail.mockResolvedValue({ errCode: 0, message: "Nếu email tồn tại, hướng dẫn đã được gửi" });
  render(<ForgotPasswordPage />);
  fireEvent.change(screen.getByLabelText("Email tài khoản"), { target: { value: "buyer@example.com" } });
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(sendForgotPasswordEmail).toHaveBeenCalledWith({ email: "buyer@example.com" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Nếu email tồn tại");
});
test("reset page rejects missing token links without a request", () => {
  render(<ForgotPasswordPage reset />);
  expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(resetPassword).not.toHaveBeenCalled();
});
test("reset rejects unmatched confirmation before posting the action token", () => {
  mockQuery = "userId=7&token=reset.test";
  render(<ForgotPasswordPage reset />);
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "NewPassword123!" } });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: "Different123!" } });
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("alert")).toHaveTextContent("chưa trùng khớp");
  expect(resetPassword).not.toHaveBeenCalled();
});
test("reset posts the token with a new password and prevents a replay from the form", async () => {
  mockQuery = "userId=7&token=reset.test";
  resetPassword.mockResolvedValue({ errCode: 0 });
  render(<ForgotPasswordPage reset />);
  for (const label of ["Mật khẩu mới", "Xác nhận mật khẩu"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "NewPassword123!" } });
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ id: "7", token: "reset.test", password: "NewPassword123!" }));
  expect(await screen.findByRole("status")).toHaveTextContent("thành công");
  expect(screen.getByRole("button")).toBeDisabled();
});