import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    const [searchParams] = useSearchParams();
    const embed = searchParams.get("embed") === "1";

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {embed ? null : <AppTopNav />}
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            {embed ? null : <AgentPanel />}
        </div>
    );
}
