import React, { useState, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DetailUserPage from "./DetailUserPage";
import CategoryUser from "./CategoryUser";
import AddressUser from "./AddressUser";
import OrderUser from "./OrderUser";

function UserHomePage(props) {
    const [user, setUser] = useState({});

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem("userData"));
        setUser(userData);
    }, []);

    return (
        <div
            style={{ display: "flex" }}
            className="container rounded bg-white mt-5 mb-5"
        >
            <Routes>
                <Route path="detail/:id" element={<DetailUserPage />} />
                <Route
                    path="address/:id"
                    element={<AddressUser id={user && user.id} />}
                />
                <Route
                    path="order/:id"
                    element={<OrderUser id={user && user.id} />}
                />
                <Route
                    path="*"
                    element={
                        <Navigate
                            to={`/user/detail/${user && user.id ? user.id : ""}`}
                            replace
                        />
                    }
                />
            </Routes>
            <CategoryUser id={user && user.id} />
        </div>
    );
}

export default UserHomePage;
