// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "@/components/auth/login-form";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/auth/actions", () => ({
  loginAction: vi.fn(async (state: unknown) => state),
}));

describe("LoginForm", () => {
  it("renders labeled email and password fields with a submit button", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
    expect(
      (screen.getByLabelText("Email") as HTMLInputElement).type
    ).toBe("email");
    expect(
      (screen.getByLabelText("Password") as HTMLInputElement).type
    ).toBe("password");
  });

  it("links to password recovery and signup", () => {
    render(<LoginForm />);

    const forgot = screen.getByRole("link", { name: "Forgot password?" });
    expect(forgot.getAttribute("href")).toBe("/forgot-password");

    const signup = screen.getByRole("link", { name: "Create an account" });
    expect(signup.getAttribute("href")).toBe("/signup");
  });

  it("passes a sanitized callbackUrl as a hidden field", () => {
    render(<LoginForm callbackUrl="/domains" />);

    const hidden = document.querySelector('input[name="callbackUrl"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("/domains");
  });

  it("surfaces the notice (verification success) prominently", () => {
    render(<LoginForm notice="Your email is verified. Sign in to continue." />);

    expect(
      screen.getByText("Your email is verified. Sign in to continue.")
    ).toBeDefined();
  });
});
