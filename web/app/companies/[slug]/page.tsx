"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Logo, Notice, Skeleton } from "@/app/components/app-shell";
import { TrustProfileView } from "@/app/components/trust-profile";
import { loadPublicTrustProfile, type OrganizationTrustProfile } from "@/lib/openlc-api";
import { BuiltOnBotChain } from "@/app/components/built-on-botchain";

export default function PublicTrustPage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<OrganizationTrustProfile>();
  const [error, setError] = useState("");
  useEffect(() => { if (slug) loadPublicTrustProfile(slug).then(setProfile).catch((cause) => setError(cause instanceof Error ? cause.message : "This trust profile is not available.")); }, [slug]);
  return <div className="public-trust-shell"><header><Logo /><span>Verified company activity</span></header><main>{error ? <Notice tone="error">{error}</Notice> : profile ? <TrustProfileView profile={profile} /> : <section className="panel"><Skeleton lines={6} /></section>}</main><footer><span>OpenLC publishes transaction-derived facts only. Commercial records remain private.</span><BuiltOnBotChain /></footer></div>;
}
