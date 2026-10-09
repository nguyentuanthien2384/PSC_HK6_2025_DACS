import React, { useState, useEffect } from "react";
import { getAllCodeService } from "../../services/userService";
const allCategories = { code: "ALL", value: "Tất cả" };

function Category(props) {
    const [arrCategory, setarrCategory] = useState([allCategories]);
    const [activeLinkId, setactiveLinkId] = useState("ALL");

    useEffect(() => {
        let active = true;
        const fetchCategory = async () => {
            try {
                const response = await getAllCodeService("CATEGORY");
                if (active && response && response.errCode === 0 && Array.isArray(response.data)) {
                    setarrCategory([allCategories, ...response.data.filter((item) => item.code !== "ALL")]);
                }
            } catch (error) {
                if (active) setarrCategory([allCategories]);
            }
        };
        fetchCategory();
        return () => { active = false; };
    }, []);
    let handleClickCategory = (code) => {
        props.handleRecevieDataCategory(code);
        setactiveLinkId(code);
    };

    return (
        <aside className="left_widgets p_filter_widgets">
            <div className="l_w_title">
                <h3>Các danh mục</h3>
            </div>
            <div className="widgets_inner">
                <ul className="list">
                    {arrCategory &&
                        arrCategory.length > 0 &&
                        arrCategory.map((item) => {
                            return (
                                <li
                                    className={
                                        item.code === activeLinkId
                                            ? "active"
                                            : ""
                                    }
                                    key={item.code}
                                >
                                    <button
                                        type="button"
                                        aria-pressed={item.code === activeLinkId}
                                        onClick={() => handleClickCategory(item.code)}
                                    >
                                        {item.value}
                                    </button>
                                </li>
                            );
                        })}
                </ul>
            </div>
        </aside>
    );
}

export default Category;
