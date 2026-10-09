import React, { useState, useEffect } from 'react';

import { getAllCodeService } from '../../services/userService';
const allBrands = { code: 'ALL', value: 'Tất cả' };

function Brand(props) {


    const [activeLinkId, setactiveLinkId] = useState('ALL')
    const [arrBrand, setarrBrand] = useState([allBrands])
    let handleClickBrand = (code) => {
        props.handleRecevieDataBrand(code)
        setactiveLinkId(code)
    }
    useEffect(() => {
        let active = true;
        const fetchBrand = async () => {
            try {
                const response = await getAllCodeService('BRAND');
                if (active && response && response.errCode === 0 && Array.isArray(response.data)) {
                    setarrBrand([allBrands, ...response.data.filter((item) => item.code !== 'ALL')]);
                }
            } catch (error) {
                if (active) setarrBrand([allBrands]);
            }
        };
        fetchBrand();
        return () => { active = false; };
    }, [])
    return (

        <aside className="left_widgets p_filter_widgets">
            <div className="l_w_title">
                <h3>Các thương hiệu</h3>
            </div>
            <div className="widgets_inner">
                <ul className="list">
                    {arrBrand && arrBrand.length > 0 &&
                        arrBrand.map((item) => {
                            return (
                                <li className={item.code === activeLinkId ? 'active' : ''} key={item.code}>
                                    <button
                                        type="button"
                                        aria-pressed={item.code === activeLinkId}
                                        onClick={() => handleClickBrand(item.code)}
                                    >
                                        {item.value}
                                    </button>
                                </li>
                            )
                        })
                    }

                </ul>
            </div>
        </aside>

    );
}

export default Brand;
