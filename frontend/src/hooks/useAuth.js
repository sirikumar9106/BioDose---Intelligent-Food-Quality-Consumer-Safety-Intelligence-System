import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'http://localhost:8000/api/v1/auth';

export function useAuth() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState(null);

    const fetchProfile = useCallback(async (token) => {
        try {
            const response = await fetch(`${API_BASE_URL}/profile/`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setUser(data);
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (response.ok) {
                setAccessToken(data.access);
                await fetchProfile(data.access);
                // Note: The backend should ideally set the refresh token in an HTTP-only cookie
                // For SimpleJWT default behavior without custom cookies, it returns it in the body.
                // We assume you have a custom middleware/view layer adjusting it to HTTP-only if required.
                return { success: true };
            }
            return { success: false, error: data };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const register = async (userData) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/register/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            const data = await response.json();
            if (response.ok) {
                setAccessToken(data.access);
                setUser(data.user);
                return { success: true };
            }
            return { success: false, error: data };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        // Ideally pass refresh token if available from cookie or elsewhere
        try {
            await fetch(`${API_BASE_URL}/logout/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                // body: JSON.stringify({ refresh: refresh_token_from_cookie })
            });
        } catch (e) {
            console.error('Logout failed on backend:', e);
        }
        setAccessToken(null);
        setUser(null);
    };

    // Auto-refresh the token every 14 minutes
    useEffect(() => {
        if (!accessToken) return;

        const refreshInterval = setInterval(async () => {
            try {
                // For HTTP-only cookie setups, we just hit the refresh endpoint
                // and the browser sends the refresh cookie automatically.
                const response = await fetch(`${API_BASE_URL}/token/refresh/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // body: JSON.stringify({ refresh: "token_if_not_using_cookies" })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.access) {
                        setAccessToken(data.access);
                    }
                } else {
                    // Refresh failed, probably expired
                    setAccessToken(null);
                    setUser(null);
                }
            } catch (error) {
                console.error("Token refresh failed", error);
            }
        }, 14 * 60 * 1000); // 14 minutes

        return () => clearInterval(refreshInterval);
    }, [accessToken]);

    return {
        user,
        loading,
        login,
        register,
        logout,
        accessToken
    };
}
