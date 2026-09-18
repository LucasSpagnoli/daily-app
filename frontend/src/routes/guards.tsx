import React from "react";
import { Navigate, Outlet } from "react-router-dom";
// import { getUserPreferences } from "../api/preferences";
import { useAuth } from "../api/lib/AuthContext";

export const RequireAuth: React.FC = () => {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export const RedirectIfAuth: React.FC = () => {
    const { isAuthenticated, user } = useAuth();

    if (isAuthenticated) {
        return <Navigate to={user?.role === 'admin' ? "/admin" : "/clients"} replace />;
    }

    return <Outlet />;
};

export const RequireAdmin: React.FC = () => {
    const { user } = useAuth();

    if (!user || user.role !== 'admin') {
        return <Navigate to="/clients" replace />;
    }

    return <Outlet />;
};

export const RequireNonAdmin: React.FC = () => {
    const { user } = useAuth();

    if (user?.role === 'admin') {
        return <Navigate to="/admin" replace />;
    }

    return <Outlet />;
};

// export const RequirePreferences: React.FC = () => {
// const { user } = useAuth();
// const [checking, setChecking] = useState(true);
// const [hasPreferences, setHasPreferences] = useState(true);

// useEffect(() => {
//     if (!user) {
//         setChecking(false);
//         return;
//     }

//     let mounted = true;

//     getUserPreferences()
//         .then((topics) => {
//             if (mounted) setHasPreferences(topics.length > 0);
//         })
//         .catch(() => {
//             if (mounted) setHasPreferences(false);
//         })
//         .finally(() => {
//             if (mounted) setChecking(false);
//         });

//     return () => {
//         mounted = false;
//     };
// }, [user]);

// if (checking) {
//     return (
//         <div className="min-h-screen w-full flex items-center justify-center bg-white">
//             <p className="text-sm text-black/40 uppercase tracking-[0.2em]">
//                 Carregando...
//             </p>
//         </div>
//     );
// }

// if (!hasPreferences) {
//     return <Navigate to="/preferences" replace />;
// }

// return <Outlet />;
// };