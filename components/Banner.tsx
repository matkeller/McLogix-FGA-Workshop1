export function Banner() {
  return (
    <div role="alert" className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <strong>DEMO ONLY:</strong> identity comes from a spoofable header. This is bad practice and is used here only so
      we can focus on FGA. Production derives the user from a verified token (e.g. a JWT).
    </div>
  );
}
