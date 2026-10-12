'use client'
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import Banner from "@/components/Banner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchProducts } from "@/lib/features/product/productSlice";

export default function PublicLayout({ children }) {

    const dispatch = useDispatch();

    // Refresh products whenever the storefront mounts, so changes made in the
    // seller/admin panels show up when coming back.
    useEffect(() => {
        dispatch(fetchProducts());
    }, [dispatch]);

    return (
        <>
            <Banner />
            <Navbar />
            {children}
            <Footer />
        </>
    );
}
