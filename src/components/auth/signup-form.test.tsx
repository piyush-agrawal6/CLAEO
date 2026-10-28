// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignupForm } from "@/components/auth/signup-form";

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
  signupAction: vi.fn(async (state: unknown) => state),
  signInWithGoogleAction: vi.fn(async () => undefined),
}));

describe("SignupForm", () => {
  it("offers Continue with Google above the email divider", () => {
    render(<SignupForm />);

    expect(screen.getByRole("button", { name: /continue with google/i })).toBeDefined();
    expect(screen.getByText("or create account with email")).toBeDefined();
  });

  it("renders the email signup fields with a create-account button", () => {
    render(<SignupForm />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Work email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
    expect((screen.getByLabelText("Work email") as HTMLInputElement).type).toBe("email");
  });

  it("links to sign in", () => {
    render(<SignupForm />);

    const signin = screen.getByRole("link", { name: "Sign in" });
    expect(signin.getAttribute("href")).toBe("/login");
  });
});
