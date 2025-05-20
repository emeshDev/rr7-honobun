// components/Navbar.tsx - Ultra Safe Version
import React, { useState } from "react";
import { Link, useLocation } from "react-router";
import NavLink from "./NavLink";
import type { User } from "~/db/schema";

type NavbarProps = {
  user: Omit<User, "passwordHash"> | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onLogout: () => void;
  dataSource?: "server" | "client" | "api" | "layout";
};

export default function Navbar({
  user,
  isLoading,
  isAuthenticated,
  onLogout,
  dataSource,
}: NavbarProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Use ref to prevent multiple logout attempts
  const logoutInProgressRef = React.useRef(false);

  // Ultra-safe logout handler
  const handleLogout = React.useCallback(
    (e: React.MouseEvent) => {
      // Prevent all default behaviors
      e.preventDefault();
      e.stopPropagation();

      // Prevent multiple clicks/calls
      if (logoutInProgressRef.current) {
        console.log("Logout already in progress, ignoring additional clicks");
        return;
      }

      // Set flag to prevent multiple calls
      logoutInProgressRef.current = true;

      // Log the action
      console.log("Navbar: Initiating logout");

      // Call the logout function (with no parameters)
      onLogout();

      // Disable the button to prevent further clicks
      const button = e.currentTarget as HTMLButtonElement;
      if (button) {
        button.disabled = true;
        button.classList.add("opacity-50");
        button.innerText = "Logging out...";
      }
    },
    [onLogout]
  );

  return (
    <header className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Left side navigation */}
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link to="/" className="text-xl font-bold text-indigo-600">
                RR7 Auth
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {/* Menggunakan NavLink dengan exact untuk Home */}
              <NavLink to="/" exact>
                Home
              </NavLink>

              {/* Menggunakan NavLink untuk Todos */}
              <NavLink to="/dashboard/todos">Todos (Protected)</NavLink>

              {/* Menggunakan NavLink untuk Dashboard */}
              <NavLink to="/dashboard" exact>
                Dashboard
              </NavLink>
            </div>
          </div>

          {/* Right side - User info and logout */}
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {isLoading ? (
              <div className="h-5 w-24 animate-pulse rounded bg-gray-200"></div>
            ) : isAuthenticated && user ? (
              <div className="flex items-center space-x-4">
                <div className="text-sm font-medium text-gray-700">
                  {user.email}
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 p-2"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={
                    mobileMenuOpen
                      ? "M6 18L18 6M6 6l12 12"
                      : "M4 6h16M4 12h16M4 18h16"
                  }
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        {mobileMenuOpen && (
          <div className="sm:hidden pb-3">
            <div className="space-y-1 pt-2 pb-3">
              <Link
                to="/"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === "/"
                    ? "bg-indigo-50 text-indigo-700 border-l-4 border-indigo-500"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                to="/dashboard"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === "/dashboard"
                    ? "bg-indigo-50 text-indigo-700 border-l-4 border-indigo-500"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/dashboard/todos"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === "/dashboard/todos"
                    ? "bg-indigo-50 text-indigo-700 border-l-4 border-indigo-500"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Todos (Protected)
              </Link>

              {isAuthenticated ? (
                <button
                  onClick={(e) => {
                    handleLogout(e);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              ) : (
                <Link
                  to="/login"
                  className="block px-3 py-2 rounded-md text-base font-medium text-indigo-600 hover:bg-indigo-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}

        {process.env.NODE_ENV === "development" && dataSource && (
          <span className="absolute top-1 right-1 text-xs px-1 py-0.5 bg-gray-200 rounded">
            Data: {dataSource}
          </span>
        )}
      </div>
    </header>
  );
}
