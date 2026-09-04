type LayoutProps = {
  children: React.ReactNode;
};

export default function ProjectLayout({ children }: LayoutProps) {
  return <div>{children}</div>;
}
