import React, { useState } from 'react';
import { DeleteAllcodeService, getListAllCodeService } from '../../../services/userService';
import { toast } from 'react-toastify';
import { PAGINATION } from '../../../utils/constant';
import CommonUtils from '../../../utils/CommonUtils';
import { Link } from 'react-router-dom';
import AdminPagination from '../AdminPagination';
import FormSearch from '../../../component/Search/FormSearch';
import usePagedAdminList from '../usePagedAdminList';

const ManageCategory = () => {

    const [keyword, setkeyword] = useState('')
    const { data: dataCategory, count, page: numberPage, setPage, loading, error, reload } = usePagedAdminList(getListAllCodeService, { type: 'CATEGORY', keyword });
    let handleDeleteCategory = async (event, id) => {
        event.preventDefault();
        let res = await DeleteAllcodeService(id)
        if (res && res.errCode === 0) {
            toast.success("Xóa danh mục thành công")
            reload();

        } else toast.error("Xóa danh mục thất bại")
    }
    let handleChangePage = number => { if (!loading) setPage(number.selected); };
    let handleSearchCategory = (keyword) =>{
        setkeyword(keyword.trim()); setPage(0);
    }
    let handleOnchangeSearch = (keyword) =>{
        if(keyword === ''){
            setkeyword(''); setPage(0);
        }
    }
    let handleOnClickExport =async () =>{
        let res = await getListAllCodeService({
            type: 'CATEGORY',
            limit: '',
            offset: '',
            keyword:''
        })
        if(res && res.errCode === 0){
            await CommonUtils.exportExcel(res.data,"Danh sách danh mục","ListCategory")
        }
       
    }
    return (
        <div className="container-fluid px-4">
            <h1 className="mt-4">Quản lý danh mục</h1>


            <div className="card mb-4">
                <div className="card-header">
                    <i className="fas fa-table me-1" />
                    Danh sách danh mục sản phẩm
                </div>
                <div className="card-body">
                
                    <div className='row'>
                    <div  className='col-4'>
                    <FormSearch title={"tên danh mục"}  handleOnchange={handleOnchangeSearch} handleSearch={handleSearchCategory} />
                    </div>
                    <div className='col-8'>
                    <button  style={{float:'right'}} onClick={() => handleOnClickExport()} className="btn btn-success" >Xuất excel <i className="fa-solid fa-file-excel"></i></button>
                    </div>
                    </div>
                    <p role="status" style={{ minHeight: 24 }}>{loading ? 'Đang tải danh mục…' : ''}</p>
                    {error && <p role="alert">{error} <button type="button" onClick={reload}>Thử lại</button></p>}
                    <div className="table-responsive" aria-busy={loading}>
                        <table className="table table-bordered" inert={loading ? true : undefined} style={{ border: '1' }} width="100%" cellSpacing="0">
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Tên</th>
                                    <th>mã code</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>

                            <tbody>
                                {dataCategory && dataCategory.length > 0 &&
                                    dataCategory.map((item, index) => {
                                        return (
                                            <tr key={item.id}>
                                                <td>{numberPage * PAGINATION.pagerow + index + 1}</td>
                                                <td>{item.value}</td>
                                                <td>{item.code}</td>
                                                <td>
                                                    <Link to={`/system/home/edit-category/${item.id}`}>Edit</Link>
                                                    &nbsp; &nbsp;
                                                    <button type="button" className="btn btn-link p-0" disabled={loading} onClick={(event) => handleDeleteCategory(event, item.id)}>Delete</button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                }


                            </tbody>
                        </table>
                        <AdminPagination pageCount={Math.max(1, count)} forcePage={numberPage} onPageChange={handleChangePage} loading={loading} />
                    </div>
                </div>
            </div>
        </div>
    )
}
export default ManageCategory;
