import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/calendar/:path*",
    "/composer/:path*",
    "/analytics/:path*",
    "/accounts/:path*",
    "/billing/:path*",
    "/posts/:path*",
    "/support/:path*",
    "/community/:path*",
    "/link-in-bio/:path*",
    "/retention/:path*",
    "/reports/:path*",
    "/calendar-share/:path*",
    "/settings/:path*",
    "/interactions/:path*"
  ]
};
