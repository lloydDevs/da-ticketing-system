export default function LoadingSpinner({
    text = "Loading..."
}) {
    return (
        <div className="flex flex-col items-center justify-center h-64">
            <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>

            <p className="mt-4 text-sm text-gray-500 animate-pulse">
                {text}
            </p>
        </div>
    );
}