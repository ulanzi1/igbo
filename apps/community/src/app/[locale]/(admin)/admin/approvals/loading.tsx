export default function ApprovalsLoading() {
  return (
    <div className="p-6">
      <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
        <div className="h-20 bg-zinc-800 rounded animate-pulse" />
        <div className="h-20 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="h-64 bg-zinc-800 rounded animate-pulse" />
    </div>
  );
}
