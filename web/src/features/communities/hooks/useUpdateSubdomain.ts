import { useState } from "react";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";

type SubdomainError = "conflict" | "invalid" | "forbidden" | "unknown";

export function useUpdateSubdomain() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateSubdomain(slug: string): Promise<void> {
    setError(null);
    setIsUpdating(true);
    try {
      const url = `${relayHttpBaseUrl()}/api/admin/v1/workspace/subdomain`;
      const authHeader = await makeNip98AuthHeader(url, "PATCH");
      const body = JSON.stringify({ slug });
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body,
      });

      if (res.ok) {
        window.location.replace(`https://${slug}.lengrowth.com`);
        return;
      }

      const errorType: SubdomainError =
        res.status === 409
          ? "conflict"
          : res.status === 422
            ? "invalid"
            : res.status === 403
              ? "forbidden"
              : "unknown";

      setError(
        errorType === "conflict"
          ? "This subdomain is already taken."
          : errorType === "invalid"
            ? "Letters, numbers, and hyphens only (3–63 chars)."
            : errorType === "forbidden"
              ? "Only the workspace owner can change the subdomain."
              : "An unexpected error occurred. Please try again.",
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  return { updateSubdomain, isUpdating, error };
}
