import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ReactGA from "react-ga4";

const GoogleAnalytics = () => {
    const location = useLocation();

    useEffect(() => {
        const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID;
        if (gaId) {
            ReactGA.initialize(gaId);
        }
    }, []);

    useEffect(() => {
        const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID;
        if (gaId) {
            ReactGA.send({
                hitType: "pageview",
                page: location.pathname + location.search
            });
        }
    }, [location]);

    return null;
};

export default GoogleAnalytics;
