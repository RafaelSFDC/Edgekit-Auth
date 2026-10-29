import React from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AdminGuard } from "@/components/AdminGuard";
import { Login } from "@/pages/Login";
import { Overview } from "@/pages/Overview";
import { Users } from "@/pages/Users";
import { Organizations } from "@/pages/Organizations";
import { Sessions } from "@/pages/Sessions";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        {/* Public Login Route */}
        <Route path="/login" component={Login} />

        {/* Protected Admin Routes */}
        <Route path="/">
          <AdminGuard>
            <Overview />
          </AdminGuard>
        </Route>

        <Route path="/users">
          <AdminGuard>
            <Users />
          </AdminGuard>
        </Route>

        <Route path="/organizations">
          <AdminGuard>
            <Organizations />
          </AdminGuard>
        </Route>

        <Route path="/sessions">
          <AdminGuard>
            <Sessions />
          </AdminGuard>
        </Route>

        {/* Fallback to Overview */}
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </QueryClientProvider>
  );
}
export default App;
