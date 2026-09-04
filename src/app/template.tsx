"use client";

import { usePathname } from "next/navigation";

export default function RootTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="ui-page-enter">
      {children}
    </div>
  );
}
