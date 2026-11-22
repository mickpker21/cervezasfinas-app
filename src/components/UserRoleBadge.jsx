export default function UserRoleBadge({ role }) {
  const colors = {
    admin: "bg-red-500",
    asesor: "bg-blue-500",
    conquista: "bg-green-500",
    televenta: "bg-yellow-500",
  };

  return (
    <span className={`px-3 py-1 text-white text-sm rounded ${colors[role] || "bg-gray-400"}`}>
      {role}
    </span>
  );
}